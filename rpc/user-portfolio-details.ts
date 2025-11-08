/*

CREATE OR REPLACE FUNCTION get_user_portfolio_details(p_user_id UUID)
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
  
  -- Build portfolio details
  SELECT json_build_object(
    'success', true,
    'data', json_build_object(
      'user', json_build_object(
        'userId', u.id,
        'name', u.name,
        -- ROI metrics from latest portfolio history
        'roi_1d', COALESCE(ph.roi_1d, 0),
        'roi_1w', COALESCE(ph.roi_1w, 0),
        'roi_1m', COALESCE(ph.roi_1m, 0),
        'roi_6m', COALESCE(ph.roi_6m, 0),
        'roi_1y', COALESCE(ph.roi_1y, 0),
        'roi_1ytd', COALESCE(ph.roi_1ytd, 0),
        'roi_all', COALESCE(ph.roi_all, 0),
        'available_cash', COALESCE(u.available_cash, 0),
        'winRate', COALESCE(ph.win_rate, 0),
        'holdings', COALESCE(ph.current_holding, 0),
        'averageHoldingTime', CONCAT(COALESCE(ph.average_holding_days, 0), 'd'),
        'portfolioValue', COALESCE(ph.portfolio_value, 0)
      ),
      -- Get detailed instruments from open lots
      'instruments', COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'symbol', i.symbol,
              'name', i.name,
              'averagePrice', ROUND(AVG(ol.buy_price)::numeric, 2),
              'quantity', SUM(ol.quantity),
              'exchange', i.exchange,
              'sector', COALESCE(i.industry, 'N/A')
            )
          )
          FROM ms_open_lots ol
          JOIN ms_instruments i ON i.id = ol.instrument_id
          WHERE ol.user_id = p_user_id
          GROUP BY i.id, i.symbol, i.name, i.exchange, i.industry
          ORDER BY i.symbol
        ),
        '[]'::json
      )
    )
  ) INTO v_result
  FROM users u
  LEFT JOIN LATERAL (
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
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to fetch portfolio details',
      'details', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

*/