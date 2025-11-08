/*



CREATE OR REPLACE FUNCTION get_instrument_details(p_instrument_id INT)
RETURNS JSONB AS $$
DECLARE
  v_instrument_exists BOOLEAN;
  v_result JSONB;
BEGIN

  -- Step 1: Check if instrument exists (early exit)

  SELECT EXISTS(
    SELECT 1 FROM ms_instruments WHERE id = p_instrument_id
  ) INTO v_instrument_exists;
  
  IF NOT v_instrument_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Instrument not found with ID: ' || p_instrument_id
    );
  END IF;
  

  -- Step 2: Fetch all data in ONE query using CTE

  WITH historical_prices AS (
    -- Get all historical close prices using conditional aggregation
    -- This is the magic: One query does the work of 6 separate queries
    SELECT 
      -- Get close price from 1 day ago
      MAX(close_price) FILTER (
        WHERE updated_at = CURRENT_DATE - INTERVAL '1 day'
      ) AS close_1d,
      
      -- Get close price from 1 week ago (7 days)
      MAX(close_price) FILTER (
        WHERE updated_at = CURRENT_DATE - INTERVAL '7 days'
      ) AS close_1w,
      
      -- Get close price from 1 month ago (30 days)
      MAX(close_price) FILTER (
        WHERE updated_at = CURRENT_DATE - INTERVAL '30 days'
      ) AS close_1m,
      
      -- Get close price from 6 months ago (180 days)
      MAX(close_price) FILTER (
        WHERE updated_at = CURRENT_DATE - INTERVAL '180 days'
      ) AS close_6m,
      
      -- Get close price from 1 year ago (365 days)
      MAX(close_price) FILTER (
        WHERE updated_at = CURRENT_DATE - INTERVAL '365 days'
      ) AS close_1y,
      
      -- Get earliest close price (all-time)
      MIN(close_price) FILTER (
        WHERE updated_at = (
          SELECT MIN(updated_at) 
          FROM ms_stock_performances 
          WHERE instrument_id = p_instrument_id
        )
      ) AS close_all
      
    FROM ms_stock_performances
    WHERE instrument_id = p_instrument_id
      -- Only look at dates we need (performance optimization)
      AND updated_at >= CURRENT_DATE - INTERVAL '365 days'
  ),
  
  latest_performance AS (
    -- Get today's latest performance data
    SELECT 
      close_price,
      buyers_today,
      sellers_today,
      current_holders
    FROM ms_stock_performances
    WHERE instrument_id = p_instrument_id
    ORDER BY updated_at DESC
    LIMIT 1
  )
  

  -- Step 3: Build final JSON response with ROI calculations

  SELECT jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      -- Basic instrument info
      'symbol', i.symbol,
      'name', i.name,
      'exchange', i.exchange,
      'industry', COALESCE(i.industry, 'N/A'),
      
      -- Current performance metrics (camelCase for API consistency)
      'priceToday', COALESCE(lp.close_price, 0::NUMERIC(12,2)),
      'buyersToday', COALESCE(lp.buyers_today, 0),
      'sellersToday', COALESCE(lp.sellers_today, 0),
      'currentHolders', COALESCE(lp.current_holders, 0),
      
      -- Historical close prices (camelCase)
      'closePrice1d', COALESCE(hp.close_1d, 0::NUMERIC(12,2)),
      'closePrice1w', COALESCE(hp.close_1w, 0::NUMERIC(12,2)),
      'closePrice1m', COALESCE(hp.close_1m, 0::NUMERIC(12,2)),
      'closePrice6m', COALESCE(hp.close_6m, 0::NUMERIC(12,2)),
      'closePrice1y', COALESCE(hp.close_1y, 0::NUMERIC(12,2)),
      'closePriceAll', COALESCE(hp.close_all, 0::NUMERIC(12,2)),
      
      -- ROI calculations (percentage changes)
      -- Formula: ((current_price - old_price) / old_price) * 100
      'roi1d', CASE 
        WHEN hp.close_1d IS NOT NULL AND hp.close_1d > 0 
        THEN ROUND(((lp.close_price - hp.close_1d) / hp.close_1d * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END,
      
      'roi1w', CASE 
        WHEN hp.close_1w IS NOT NULL AND hp.close_1w > 0 
        THEN ROUND(((lp.close_price - hp.close_1w) / hp.close_1w * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END,
      
      'roi1m', CASE 
        WHEN hp.close_1m IS NOT NULL AND hp.close_1m > 0 
        THEN ROUND(((lp.close_price - hp.close_1m) / hp.close_1m * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END,
      
      'roi6m', CASE 
        WHEN hp.close_6m IS NOT NULL AND hp.close_6m > 0 
        THEN ROUND(((lp.close_price - hp.close_6m) / hp.close_6m * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END,
      
      'roi1y', CASE 
        WHEN hp.close_1y IS NOT NULL AND hp.close_1y > 0 
        THEN ROUND(((lp.close_price - hp.close_1y) / hp.close_1y * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END,
      
      'roiAll', CASE 
        WHEN hp.close_all IS NOT NULL AND hp.close_all > 0 
        THEN ROUND(((lp.close_price - hp.close_all) / hp.close_all * 100)::NUMERIC, 2)
        ELSE 0::NUMERIC 
      END
    ),
    'message', 'Fetched instrument successfully'
  ) INTO v_result
  FROM ms_instruments i
  CROSS JOIN historical_prices hp
  CROSS JOIN latest_performance lp
  WHERE i.id = p_instrument_id;
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error internally for debugging (visible in Supabase logs)
    RAISE NOTICE 'get_instrument_details error for instrument_id %: %', p_instrument_id, SQLERRM;
    
    -- Return generic user-friendly error message
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Failed to fetch instrument details'
    );
END;
$$ LANGUAGE plpgsql;









-- ============================================================
-- Performance Indexes (Run these if not already created)
-- ============================================================

-- Index for efficient historical price lookups
CREATE INDEX IF NOT EXISTS idx_stock_perf_instrument_date 
ON ms_stock_performances(instrument_id, updated_at DESC);

-- Index for latest performance data
CREATE INDEX IF NOT EXISTS idx_stock_perf_updated_at 
ON ms_stock_performances(updated_at DESC);

-- Index for realtime prices (if needed later)
CREATE INDEX IF NOT EXISTS idx_realtime_prices_instrument_date 
ON ms_stock_realtime_prices(instrument_id, created_at DESC);

-- Index for instrument lookups
CREATE INDEX IF NOT EXISTS idx_instruments_symbol 
ON ms_instruments(symbol);
*/