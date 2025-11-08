/*
-- ============================================================
-- RPC: Archive Daily Stock Performance
-- ============================================================
-- This function runs at end of trading day to:
-- 1. Calculate OHLC (Open, High, Low, Close) from realtime prices
-- 2. Store in ms_stock_performances for historical tracking
-- 3. Clean up ms_stock_realtime_prices table
-- 
-- Think of it as: "Din khatam, data archive kar, cleanup kar"
-- ============================================================

CREATE OR REPLACE FUNCTION archive_daily_stock_performance()
RETURNS JSONB AS $$
DECLARE
  v_instruments_processed INT := 0;
  v_rows_inserted INT := 0;
  v_rows_deleted INT := 0;
  v_today DATE := CURRENT_DATE;
  v_error_msg TEXT;
BEGIN
  -- ============================================================
  -- Step 1: Calculate OHLC and trading metrics using CTE
  -- ============================================================
  -- This single query does all calculations efficiently
  
  WITH daily_price_stats AS (
    -- Calculate Open, High, Low, Close for each instrument
    SELECT 
      srp.instrument_id,
      
      -- Open price: First trade of the day (earliest time)
      (ARRAY_AGG(srp.last_traded_price ORDER BY srp.created_at ASC))[1] AS open_price,
      
      -- Close price: Last trade of the day (latest time)
      (ARRAY_AGG(srp.last_traded_price ORDER BY srp.created_at DESC))[1] AS close_price,
      
      -- High price: Maximum traded price
      MAX(srp.last_traded_price) AS high_price,
      
      -- Low price: Minimum traded price
      MIN(srp.last_traded_price) AS low_price,
      
      -- Count of trades (for validation)
      COUNT(*) AS trade_count
      
    FROM ms_stock_realtime_prices srp
    WHERE DATE(srp.created_at) = v_today
    GROUP BY srp.instrument_id
  ),
  
  trading_activity AS (
    -- Calculate buyers, sellers, current holders from ms_trades
    -- (Trades that happened today)
    SELECT 
      t.instrument_id,
      
      -- Count unique buyers (who placed BUY orders today)
      COUNT(DISTINCT CASE WHEN t.type = 'BUY' THEN t.user_id END) AS buyers_today,
      
      -- Count unique sellers (who placed SELL orders today)
      COUNT(DISTINCT CASE WHEN t.type = 'SELL' THEN t.user_id END) AS sellers_today
      
    FROM ms_trades t
    WHERE DATE(t.order_date) = v_today
      AND t.status = 'FILLED'  -- Only count completed trades
    GROUP BY t.instrument_id
  ),
  
  current_holders_count AS (
    -- Count users who currently hold each instrument
    SELECT 
      ol.instrument_id,
      COUNT(DISTINCT ol.user_id) AS current_holders
    FROM ms_open_lots ol
    WHERE ol.quantity > 0
    GROUP BY ol.instrument_id
  )
  
  -- ============================================================
  -- Step 2: Insert/Update performance data
  -- ============================================================
  
  INSERT INTO ms_stock_performances (
    instrument_id,
    updated_at,
    buyers_today,
    sellers_today,
    current_holders,
    open_price,
    close_price,
    high_price,
    low_price
  )
  SELECT 
    dps.instrument_id,
    v_today,
    COALESCE(ta.buyers_today, 0),
    COALESCE(ta.sellers_today, 0),
    COALESCE(chc.current_holders, 0),
    dps.open_price,
    dps.close_price,
    dps.high_price,
    dps.low_price
  FROM daily_price_stats dps
  LEFT JOIN trading_activity ta ON dps.instrument_id = ta.instrument_id
  LEFT JOIN current_holders_count chc ON dps.instrument_id = chc.instrument_id
  WHERE dps.trade_count > 0  -- Only insert if there were trades today
  
  -- Handle duplicates: Update if record already exists for today
  ON CONFLICT (instrument_id, updated_at) 
  DO UPDATE SET
    buyers_today = EXCLUDED.buyers_today,
    sellers_today = EXCLUDED.sellers_today,
    current_holders = EXCLUDED.current_holders,
    open_price = EXCLUDED.open_price,
    close_price = EXCLUDED.close_price,
    high_price = EXCLUDED.high_price,
    low_price = EXCLUDED.low_price;
  
  -- Get count of inserted/updated rows
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  
  -- ============================================================
  -- Step 3: Delete today's realtime prices (cleanup)
  -- ============================================================
  
  DELETE FROM ms_stock_realtime_prices
  WHERE DATE(created_at) = v_today;
  
  -- Get count of deleted rows
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  
  -- ============================================================
  -- Step 4: Return success summary
  -- ============================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Daily stock performance archived successfully',
    'data', jsonb_build_object(
      'date', v_today,
      'instruments_processed', v_rows_inserted,
      'realtime_prices_deleted', v_rows_deleted,
      'execution_time', NOW()
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error internally (visible in Supabase logs)
    RAISE WARNING 'archive_daily_stock_performance failed: %, SQLSTATE: %', 
      SQLERRM, SQLSTATE;
    
    -- Return generic error to caller (don't expose DB internals)
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Failed to archive daily stock performance',
      'data', jsonb_build_object(
        'error_code', 'ARCHIVE_FAILED',
        'timestamp', NOW()
      )
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Create unique constraint if not exists
-- ============================================================
-- Ensures we can use ON CONFLICT for upsert

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ms_stock_performances_instrument_date_key'
  ) THEN
    ALTER TABLE ms_stock_performances 
    ADD CONSTRAINT ms_stock_performances_instrument_date_key 
    UNIQUE (instrument_id, updated_at);
  END IF;
END $$;

-- ============================================================
-- Setup Cron Job (Run daily at market close, e.g., 4:00 PM)
-- ============================================================

SELECT cron.schedule(
  'archive-daily-stock-performance',
  '0 16 * * *',  -- Every day at 4:00 PM (16:00)
  $$
  SELECT archive_daily_stock_performance();
  $$
);

-- ============================================================
-- Manual Execution (For Testing)
-- ============================================================

-- Test the function
SELECT archive_daily_stock_performance();

-- Check results
SELECT * FROM ms_stock_performances 
WHERE updated_at = CURRENT_DATE 
ORDER BY instrument_id;
*/