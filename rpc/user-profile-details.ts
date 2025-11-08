/*


-- FUNCTION: Get User Profile Details


CREATE OR REPLACE FUNCTION get_user_profile_details(p_user_id UUID)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_result JSONB;
BEGIN

  SELECT 
    u.id,
    u.name,
    u.user_name,
    u.available_cash,
    u.created_at,
    u.city,
    u.aadhar_verified,
    u.email,
    u.gender,
    u.location,
    u.age,
    -- Follower metrics from ms_user_details (pre-calculated)
    COALESCE(ud.follower_count, 0) as follower_count,
    COALESCE(ud.following_count, 0) as following_count,
    -- Portfolio stats from latest history
    ph.roi_all,
    ph.roi_1m,
    ph.total_trades,
    ph.win_rate
  INTO v_user_record
  FROM users u
  LEFT JOIN ms_user_details ud ON ud.user_id = u.id
  LEFT JOIN LATERAL (
    -- Get most recent portfolio history
    -- Uses index: ms_portfolio_history(user_id, updated_at DESC)
    SELECT 
      roi_all,
      roi_1m,
      total_trades,
      win_rate
    FROM ms_portfolio_history
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
    LIMIT 1
  ) ph ON true
  WHERE u.id = p_user_id;
  
  -- Check if user was found
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'User not found'
    );
  END IF;
  

  -- Step 2: Build complete response

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      -- User information (consistent camelCase)
      'user', jsonb_build_object(
        'userId', v_user_record.id,
        'name', v_user_record.name,
        'userName', v_user_record.user_name,
        'availableCash', COALESCE(v_user_record.available_cash, 0),
        'createdAt', to_char(v_user_record.created_at, 'DD Mon YYYY'),
        'city', v_user_record.city,
        'aadharVerified', COALESCE(v_user_record.aadhar_verified, false),
        'email', v_user_record.email,
        'gender', v_user_record.gender,
        'location', v_user_record.location,
        'age', v_user_record.age,
        
        -- Social metrics (from ms_user_details)
        'followersCount', v_user_record.follower_count,
        'followingCount', v_user_record.following_count,
        
        -- Market tags array
        -- Uses index: ms_market_tags(user_id)
        'marketTags', COALESCE(
          (
            SELECT jsonb_agg(mt.name ORDER BY mt.name)
            FROM ms_market_tags mt
            WHERE mt.user_id = p_user_id
          ),
          '[]'::jsonb
        ),
        
        -- Portfolio statistics
        'allTimeRoi', COALESCE(v_user_record.roi_all, 0),
        'monthlyRoi', COALESCE(v_user_record.roi_1m, 0),
        'totalTrades', COALESCE(v_user_record.total_trades, 0),
        'winRate', COALESCE(v_user_record.win_rate, 0)
      ),
      
      -- Top 3 instruments by investment value
      -- Uses index: ms_open_lots(user_id, instrument_id)
      'instruments', COALESCE(
        (
          SELECT jsonb_agg(
            instrument_data ORDER BY investment_value DESC
          )
          FROM (
            SELECT 
              jsonb_build_object(
                'name', i.name,
                'symbol', i.symbol,
                'quantity', SUM(ol.quantity),
                'averagePrice', ROUND(AVG(COALESCE(ol.buy_price, 0))::numeric, 2),
                'investmentValue', ROUND(SUM(ol.quantity * COALESCE(ol.buy_price, 0))::numeric, 2)
              ) as instrument_data,
              SUM(ol.quantity * COALESCE(ol.buy_price, 0)) as investment_value
            FROM ms_open_lots ol
            INNER JOIN ms_instruments i ON i.id = ol.instrument_id
            WHERE ol.user_id = p_user_id
              AND ol.quantity > 0
            GROUP BY i.id, i.name, i.symbol
            ORDER BY investment_value DESC
            LIMIT 3  -- Only top 3 by investment value
          ) top_instruments
        ),
        '[]'::jsonb
      )
    ),
    'message', 'Profile fetched successfully'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error internally
    RAISE NOTICE 'Error in get_user_profile_details for user %: %', 
      p_user_id, SQLERRM;
    
    -- Return generic error to client
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'An error occurred while fetching profile details'
    );
END;
$$;


-- Grant appropriate permissions

REVOKE ALL ON FUNCTION get_user_profile_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_profile_details(UUID) TO authenticated;





-- ==================================================================
-- Add documentation
-- ==================================================================
COMMENT ON FUNCTION get_user_profile_details(UUID) IS 
'Fetches comprehensive user profile including personal information, 
social metrics (followers/following), market tags, portfolio statistics, 
and top 3 instruments by investment value.

Parameters:
  p_user_id (UUID): The unique identifier of the user

Returns:
  JSONB object with structure:
  {
    success: boolean,
    data: {
      user: { 
        personal info, follower counts, market tags, portfolio stats 
      },
      instruments: [ 
        top 3 by investment value with name, symbol, quantity, avgPrice, value 
      ]
    },
    message: string
  }

Performance: Utilizes indexes on user_id, updated_at, and composite keys.
Security: Uses SECURITY DEFINER. Implement RLS for production.

Example:
  SELECT get_user_profile_details(''550e8400-e29b-41d4-a716-446655440000''::uuid);
';

*/
