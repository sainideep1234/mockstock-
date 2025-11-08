/*


CREATE OR REPLACE FUNCTION get_user_profile_details(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_user_exists BOOLEAN;
BEGIN
  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id) 
  INTO v_user_exists;
  
  IF NOT v_user_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Build profile details
  SELECT json_build_object(
    'success', true,
    'data', json_build_object(
      'user', json_build_object(
        'name', u.name,
        'user_name', u.user_name,
        'available_cash', COALESCE(u.available_cash, 0),
        'created_at', to_char(u.created_at, 'DD Mon YYYY'),
        'city', u.city,
        'aadhar_verified', COALESCE(u.aadhar_verified, false),
        'email', u.email,
        'gender', u.gender,
        'location', u.location,
        'age', u.age,
        -- Calculate followers count
        'followersCount', (
          SELECT COUNT(*) 
          FROM ms_followers 
          WHERE following_id = p_user_id
        ),
        -- Calculate following count
        'followingCount', (
          SELECT COUNT(*) 
          FROM ms_followers 
          WHERE follower_id = p_user_id
        ),
        -- Get market tags
        'marketTags', COALESCE(
          (
            SELECT json_agg(mt.name ORDER BY mt.name)
            FROM ms_market_tags mt
            WHERE mt.user_id = p_user_id
          ),
          '[]'::json
        ),
        -- Portfolio stats from latest history
        'allTimeRoi', COALESCE(ph.roi_all, 0),
        'monthlyRoi', COALESCE(ph.roi_1m, 0),
        'totalTrades', COALESCE(ph.total_trades, 0),
        'winRate', COALESCE(ph.win_rate, 0)
      ),
      -- Get simple instrument names array
      'instruments', COALESCE(
        (
          SELECT json_agg(DISTINCT i.name ORDER BY i.name)
          FROM ms_open_lots ol
          JOIN ms_instruments i ON i.id = ol.instrument_id
          WHERE ol.user_id = p_user_id
        ),
        '[]'::json
      )
    )
  ) INTO v_result
  FROM users u
  LEFT JOIN LATERAL (
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
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to fetch profile details',
      'details', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;
*/
