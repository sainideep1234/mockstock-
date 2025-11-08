/*



CREATE OR REPLACE FUNCTION get_user_portfolio_details(p_user_id UUID)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_result JSONB;
BEGIN

  -- Step 1: Fetch user data and validate existence in one query
  -- Combines existence check with data retrieval (optimized)
  -- Uses index: users(id) [primary key]

  SELECT 
    u.id,
    u.name,
    u.available_cash,
    ph.roi_1d,
    ph.roi_1w,
    ph.roi_1m,
    ph.roi_6m,
    ph.roi_1y,
    ph.roi_1ytd,
    ph.roi_all,
    ph.win_rate,
    ph.current_holding,
    ph.average_holding_days,
    ph.portfolio_value
  INTO v_user_record
  FROM users u
  LEFT JOIN LATERAL (
    -- Get the most recent portfolio history
    -- Uses index: ms_portfolio_history(user_id, updated_at DESC)
    SELECT 
      roi_1d,
      roi_1w,
      roi_1m,
      roi_6m,
      roi_1y,
      roi_1ytd,
      roi_all,
      win_rate,
      current_holding,
      average_holding_days,
      portfolio_value
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
  

  -- Step 2: Build complete response with user data and instruments

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      -- User information and metrics
      'user', jsonb_build_object(
        'userId', v_user_record.id,
        'name', v_user_record.name,
        
        -- ROI metrics (consistent camelCase naming)
        'roi1d', COALESCE(v_user_record.roi_1d, 0),
        'roi1w', COALESCE(v_user_record.roi_1w, 0),
        'roi1m', COALESCE(v_user_record.roi_1m, 0),
        'roi6m', COALESCE(v_user_record.roi_6m, 0),
        'roi1y', COALESCE(v_user_record.roi_1y, 0),
        'roi1ytd', COALESCE(v_user_record.roi_1ytd, 0),
        'roiAll', COALESCE(v_user_record.roi_all, 0),
        
        -- Portfolio metrics
        'availableCash', COALESCE(v_user_record.available_cash, 0),
        'winRate', COALESCE(v_user_record.win_rate, 0),
        'holdings', COALESCE(v_user_record.current_holding, 0),
        'averageHoldingTime', CONCAT(COALESCE(v_user_record.average_holding_days, 0), 'd'),
        'portfolioValue', COALESCE(v_user_record.portfolio_value, 0)
      ),
      
      -- Instruments array (open positions grouped by instrument)
      'instruments', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'symbol', i.symbol,
              'name', i.name,
              'averagePrice', ROUND(AVG(COALESCE(ol.buy_price, 0))::numeric, 2),
              'quantity', SUM(ol.quantity),
              'exchange', i.exchange,
              'sector', COALESCE(i.industry, 'N/A')
            )
            ORDER BY i.symbol  -- Consistent ordering
          )
          FROM ms_open_lots ol
          INNER JOIN ms_instruments i ON i.id = ol.instrument_id
          WHERE ol.user_id = p_user_id
            AND ol.quantity > 0  -- Only include active positions
          GROUP BY i.id, i.symbol, i.name, i.exchange, i.industry
        ),
        '[]'::jsonb  -- Empty array if no instruments
      )
    ),
    'message', 'Portfolio fetched successfully'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error internally (configure your logging)
    RAISE NOTICE 'Error in get_user_portfolio_details for user %: %', p_user_id, SQLERRM;
    
    -- Return generic error (don't expose DB internals to clients)
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'An error occurred while fetching portfolio details'
    );
END;
$$;


-- Grant appropriate permissions

REVOKE ALL ON FUNCTION get_user_portfolio_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_portfolio_details(UUID) TO authenticated;

-- ==================================================================
-- Add documentation
-- ==================================================================
COMMENT ON FUNCTION get_user_portfolio_details(UUID) IS 
'Fetches comprehensive user portfolio details including ROI metrics 
for multiple time periods, cash balance, and aggregated open positions.
Returns JSONB with consistent camelCase naming for frontend consumption.

Parameters:
  p_user_id (UUID): The unique identifier of the user

Returns:
  JSONB object with structure:
  {
    success: boolean,
    data: {
      user: { userId, name, roi metrics, cash, winRate, holdings, etc. },
      instruments: [{ symbol, name, averagePrice, quantity, exchange, sector }]
    },
    message: string
  }

Security: Uses SECURITY DEFINER. Implement RLS or permission checks for production.
Performance: Utilizes indexes on user_id and updated_at for optimal query speed.

Example:
  SELECT get_user_portfolio_details(''550e8400-e29b-41d4-a716-446655440000''::uuid);
';
*/