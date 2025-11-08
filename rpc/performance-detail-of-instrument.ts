/*
CREATE OR REPLACE FUNCTION get_instrument_details(p_instrument_id INT)
RETURNS JSON AS $$
DECLARE
  v_instrument_exists BOOLEAN;
  v_result JSON;
  v_close_1d FLOAT;
  v_close_1w FLOAT;
  v_close_1m FLOAT;
  v_close_6m FLOAT;
  v_close_1y FLOAT;
  v_close_all FLOAT;
  v_latest_price FLOAT;
  v_buyers_today INT;
  v_sellers_today INT;
  v_current_holders INT;
BEGIN
  -- Step 1: Check if instrument exists
  SELECT EXISTS(
    SELECT 1 FROM ms_instruments WHERE id = p_instrument_id
  ) INTO v_instrument_exists;
  
  IF NOT v_instrument_exists THEN
    RETURN json_build_object(
      'success', false,
      'data', NULL,
      'message', 'Instrument not found with ID: ' || p_instrument_id
    );
  END IF;
  
  -- Step 2: Get today's performance data (most recent record)
  SELECT 
    close_price,
    buyers_today,
    sellers_today,
    current_holders
  INTO 
    v_latest_price,
    v_buyers_today,
    v_sellers_today,
    v_current_holders
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 3: Get close price from 1 day ago
  SELECT close_price INTO v_close_1d
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
    AND updated_at::DATE = (CURRENT_DATE - INTERVAL '1 day')::DATE
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 4: Get close price from 1 week ago (7 days)
  SELECT close_price INTO v_close_1w
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
    AND updated_at::DATE = (CURRENT_DATE - INTERVAL '7 days')::DATE
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 5: Get close price from 1 month ago (30 days)
  SELECT close_price INTO v_close_1m
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
    AND updated_at::DATE = (CURRENT_DATE - INTERVAL '30 days')::DATE
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 6: Get close price from 6 months ago (180 days)
  SELECT close_price INTO v_close_6m
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
    AND updated_at::DATE = (CURRENT_DATE - INTERVAL '180 days')::DATE
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 7: Get close price from 1 year ago (365 days)
  SELECT close_price INTO v_close_1y
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
    AND updated_at::DATE = (CURRENT_DATE - INTERVAL '365 days')::DATE
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Step 8: Get earliest closing price (all-time)
  SELECT close_price INTO v_close_all
  FROM ms_stock_performances
  WHERE instrument_id = p_instrument_id
  ORDER BY updated_at ASC
  LIMIT 1;
  
  -- Step 9: Get today's live price from realtime table
  -- (This overrides close_price if market is currently open)
  SELECT last_traded_price INTO v_latest_price
  FROM ms_stock_realtime_prices
  WHERE instrument_id = p_instrument_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Step 10: Build final JSON response
  SELECT json_build_object(
    'success', true,
    'data', json_build_object(
      'symbol', i.symbol,
      'name', i.name,
      'exchange', i.exchange,
      'industry', COALESCE(i.industry, 'N/A'),
      'priceToday', COALESCE(v_latest_price, 0),
      'buyersToday', COALESCE(v_buyers_today, 0),
      'sellersToday', COALESCE(v_sellers_today, 0),
      'currentHolders', COALESCE(v_current_holders, 0),
      'close_price_1d', COALESCE(v_close_1d, 0),
      'close_price_1w', COALESCE(v_close_1w, 0),
      'close_price_1m', COALESCE(v_close_1m, 0),
      'close_price_6m', COALESCE(v_close_6m, 0),
      'close_price_1y', COALESCE(v_close_1y, 0),
      'close_price_all', COALESCE(v_close_all, 0)
    ),
    'message', 'Fetched instrument successfully'
  ) INTO v_result
  FROM ms_instruments i
  WHERE i.id = p_instrument_id;
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'data', NULL,
      'message', 'Error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

*/