// edge function take order from user 

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SQSClient, SendMessageCommand } from 'npm:@aws-sdk/client-sqs@3';
import { jwtVerify } from 'https://deno.land/x/jose@1.4.0/index.ts';

// Initialize SQS Client
const sqsClient = new SQSClient({
  region: Deno.env.get('AWS_REGION') || 'ap-south-1',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  },
});


const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);

const QUEUE_URL = Deno.env.get('AWS_SQS_QUEUE_URL')!;

interface OrderRequest {
  side: 'BUY' | 'SELL';
  symbol: string;
  quantity: number;
  trade_time: string; // "2025-11-07 10:30:00"
}

interface AuthenticatedUser {
  userId: string;
  email: string;
  aud: string;
}


const JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET')!;


// function to verify token and check user in db 
async function verifyAuth(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1]; 

  try {
    // Verify JWT signature
    const secret = new TextEncoder().encode(JWT_SECRET);
    const verified = await jwtVerify(token, secret);
    
    // Extract user info from JWT payload
    const payload = verified.payload;

    // can be skippable  because user must be present in order to call that (good if user deleted has premium cutomer , banned/suspnded)
    //check from Db
     const {  userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id',payload.userId) 
      .single();

      if(userError || !userData){
          return null
      }

    
    return {
      userId: payload.userId as string, 
      email: payload.email as string,
      aud: payload.aud as string,
    };
  } catch (error) {
    return null
  }
}



serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // check authorization of user
  try {
    let user: AuthenticatedUser;
    try {
      user = await verifyAuth(req);
      if(!user){
        return new Response(
        JSON.stringify({ message: `Invalid or expired token` }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
      }

      console.log(` User authenticated: ${user.email} (ID: ${user.userId})`);

    } catch (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }


    // Step 2: Parse and validate order
    const orderRequest: OrderRequest = await req.json();

    // Validation
    if (!orderRequest.side || !['BUY', 'SELL'].includes(orderRequest.side)) {
      return new Response(
        JSON.stringify({ error: 'Invalid order side. Must be BUY or SELL' }),
        { status: 400 }
      );
    }

    if (!orderRequest.symbol || !orderRequest.quantity || orderRequest.quantity <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol or quantity' }),
        { status: 400 }
      );
    }

    if (!orderRequest.trade_time) {
      return new Response(
        JSON.stringify({ error: 'Missing trade_time' }),
        { status: 400 }
      );
    }



    // Step 4: Create enriched order for SQS
    const order_id = crypto.randomUUID();
    const enrichedOrder = {
      order_id,
      user_id: user.userId,
      side: orderRequest.side,
      symbol: orderRequest.symbol,
      quantity: orderRequest.quantity,
      trade_time: orderRequest.trade_time,
      queued_at: new Date().toISOString(),
    };

    console.log(' Prepared order:', enrichedOrder);

    // Step 5: Push to SQS
    const command = new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(enrichedOrder),
      MessageAttributes: {
        user_id: {
          DataType: 'Number',
          StringValue: user.userId.toString(),
        },
        side: {
          DataType: 'String',
          StringValue: orderRequest.side,
        },
        symbol: {
          DataType: 'String',
          StringValue: orderRequest.symbol,
        },
      },
    });

    const sqsResponse = await sqsClient.send(command);

    console.log(' Order pushed to SQS:', sqsResponse.MessageId);

    // Step 6: Return success
    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        message_id: sqsResponse.MessageId,
        status: 'QUEUED',
        message: 'Order queued for processing',
      }),
      {
        status: 202, // Accepted
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('❌ Order handler error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500 }
    );
  }
});











// batch process cron job 

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  DeleteMessageBatchCommand,
} from 'npm:@aws-sdk/client-sqs@3';

// Initialize SQS Client
const sqsClient = new SQSClient({
  region: Deno.env.get('AWS_REGION') || 'ap-south-1',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  },
});

const QUEUE_URL = Deno.env.get('AWS_SQS_QUEUE_URL')!;

// Initialize Supabase with SERVICE ROLE KEY (for RPC calls)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const startTime = Date.now();
  
  try {


    // Step 1: Poll up to 10 messages from SQS
    const receiveCommand = new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10, // Get 10 orders at once
      WaitTimeSeconds: 5, // Long polling (reduces empty responses)
      MessageAttributeNames: ['All'],
    });

    const { Messages } = await sqsClient.send(receiveCommand);

    if (!Messages || Messages.length === 0) {
      console.log(' No orders in queue');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No orders to process',
          processed: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(` Received ${Messages.length} orders from queue`);

    // Step 2: Parse all orders into array
    const orders = Messages.map((msg) => {
      try {
        const order = JSON.parse(msg.Body!);
        console.log(`   Order: ${order.order_id} - ${order.side} ${order.quantity} ${order.symbol}`);
        return order;
      } catch (error) {
        console.error('Failed to parse message:', msg.MessageId, error);
        return null;
      }
    }).filter(Boolean); // Remove null entries

    if (orders.length === 0) {
      console.log(' No valid orders found in messages');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No valid orders found',
        }),
        { status: 400 }
      );
    }

    console.log(`Parsed ${orders.length} valid orders`);

    // Step 3: Call RPC with entire batch (ATOMIC MODE)
    console.log('Calling RPC: process_trade_orders_optimized...');
    
    const { data, error: rpcError } = await supabase.rpc(
      'process_trade_orders_optimized',
      {
        p_orders: orders, // Supabase client auto-stringifies to JSON
        p_atomic: true, // ALL-OR-NOTHING mode
      }
    );

    // Step 4: Handle RPC response
    if (rpcError) {
      console.error(' RPC Error:', rpcError);
      console.error('  Details:', JSON.stringify(rpcError, null, 2));

      //  CRITICAL: DO NOT delete messages on failure
      // They will remain in queue for retry (SQS visibility timeout)
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Batch processing failed - orders remain in queue for retry',
          error: rpcError.message,
          orders_attempted: orders.length,
          retry_advice: 'Messages will be retried after visibility timeout',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ RPC succeeded!');
    console.log('   Results:', JSON.stringify(data, null, 2));

    // Step 5: Delete ALL messages from queue (batch succeeded)
    console.log('🗑️  Deleting messages from queue...');

    // Use batch delete (more efficient than individual deletes)
    const deleteEntries = Messages.map((msg, index) => ({
      Id: index.toString(),
      ReceiptHandle: msg.ReceiptHandle!,
    }));

    const deleteBatchCommand = new DeleteMessageBatchCommand({
      QueueUrl: QUEUE_URL,
      Entries: deleteEntries,
    });

    const deleteResult = await sqsClient.send(deleteBatchCommand);

    console.log(' Deleted messages:', deleteResult.Successful?.length || 0);
    
    if (deleteResult.Failed && deleteResult.Failed.length > 0) {
      console.warn('  Some deletes failed:', deleteResult.Failed);
    }

    // Step 6: Return success summary
    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Batch processed successfully',
        orders_processed: orders.length,
        messages_deleted: deleteResult.Successful?.length || 0,
        processing_time_ms: processingTime,
        results: data, // Include RPC results
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Unexpected error in processor',
        error: error.message,
      }),
      { status: 500 }
    );
  }
});


// cron job sql editor 
-- Run order processor every 1 minute
SELECT cron.schedule(
  'process-orders-batch',
  '* * * * *', 
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/order-processor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);



/*

CREATE OR REPLACE FUNCTION process_trade_orders_batch_v2(
  p_orders JSON,
  p_atomic BOOLEAN DEFAULT true
)
RETURNS JSON AS $$
DECLARE
  v_order JSON;
  v_results JSON := '[]'::json;
  
  -- Order fields
  t_user_id UUID;  
  t_side TEXT;
  t_symbol TEXT;
  t_quantity INT;
  t_trade_time TIMESTAMP;
  
  -- Lookup results
  v_instrument_id INT;
  v_latest_price FLOAT;
  v_trade_amount FLOAT;
  v_trade_id INT;
  v_existing_lot RECORD;
  v_new_avg_price FLOAT;
  v_total_quantity INT;
  v_user_balance FLOAT;
  v_result JSON;
  
  -- Performance tracking
  v_start_time TIMESTAMP := clock_timestamp();
  v_instruments_cached JSON;
  v_prices_cached JSON;
BEGIN
  RAISE NOTICE 'Starting batch processing of % orders', json_array_length(p_orders);


  -- STEP 1: PRE-FETCH ALL INSTRUMENTS (Single Query)

  WITH distinct_symbols AS (
    SELECT DISTINCT (o->>'symbol')::text AS symbol
    FROM json_array_elements(p_orders) AS t(o)
  )
  SELECT json_object_agg(symbol, id) INTO v_instruments_cached
  FROM ms_instruments
  WHERE symbol IN (SELECT symbol FROM distinct_symbols);

  RAISE NOTICE 'Cached % instruments', json_array_length(json_build_array(v_instruments_cached));


  -- STEP 2: PRE-FETCH ALL LATEST PRICES (Single Query)

  -- Get latest price for each instrument (most recent before/at trade_time)
  WITH distinct_trades AS (
    SELECT DISTINCT 
      (o->>'symbol')::text AS symbol,
      (o->>'trade_time')::timestamp AS trade_time
    FROM json_array_elements(p_orders) AS t(o)
  ),
  latest_prices AS (
    SELECT DISTINCT ON (i.id, dt.trade_time)
      i.id AS instrument_id,
      dt.trade_time,
      rp.last_traded_price,
      rp.created_at
    FROM distinct_trades dt
    JOIN ms_instruments i ON i.symbol = dt.symbol
    JOIN ms_stock_realtime_prices rp ON rp.instrument_id = i.id
    WHERE rp.created_at <= dt.trade_time
    ORDER BY i.id, dt.trade_time, rp.created_at DESC
  )
  SELECT json_object_agg(
    instrument_id || '_' || trade_time, 
    last_traded_price
  ) INTO v_prices_cached
  FROM latest_prices;

  RAISE NOTICE 'Cached % prices', json_array_length(json_build_array(v_prices_cached));


  -- STEP 3: PROCESS EACH ORDER (Using Cached Data)

  IF p_atomic THEN
    FOR v_order IN SELECT * FROM json_array_elements(p_orders)
    LOOP
      BEGIN
        -- Extract order fields
        t_user_id := (v_order ->> 'user_id')::uuid; 
        t_side := v_order ->> 'side';
        t_symbol := v_order ->> 'symbol';
        t_quantity := (v_order ->> 'quantity')::int;
        t_trade_time := (v_order ->> 'trade_time')::timestamp;

        RAISE NOTICE '  Processing: % % % @ %', t_side, t_quantity, t_symbol, t_trade_time;


        -- Lookup instrument from cache (NO DB QUERY)  
┘
        v_instrument_id := (v_instruments_cached ->> t_symbol)::int;
        
        IF v_instrument_id IS NULL THEN
          RAISE EXCEPTION 'Invalid symbol: %. Not found in instruments cache.', t_symbol;
        END IF;


        --  Lookup price from cache (NO DB QUERY)       

        v_latest_price := (
          v_prices_cached ->> (v_instrument_id || '_' || t_trade_time)
        )::float;
        
        IF v_latest_price IS NULL THEN
          -- Fallback: Get closest price (this should rarely happen)
          SELECT last_traded_price INTO v_latest_price
          FROM ms_stock_realtime_prices
          WHERE instrument_id = v_instrument_id
            AND created_at <= t_trade_time
          ORDER BY created_at DESC
          LIMIT 1;
          
          IF v_latest_price IS NULL THEN
            RAISE EXCEPTION 'No price available for % (ID: %) at %', 
              t_symbol, v_instrument_id, t_trade_time;
          END IF;
          
          RAISE WARNING 'Price cache miss for % - used fallback', t_symbol;
        END IF;

        v_trade_amount := v_latest_price * t_quantity;


        -- BUY LOGIC

        IF t_side = 'BUY' THEN
          -- Check balance (with row lock to prevent race conditions)
          SELECT available_cash INTO v_user_balance
          FROM ms_user_details
          WHERE user_id = t_user_id
          FOR UPDATE;

          IF v_user_balance IS NULL THEN
            RAISE EXCEPTION 'User % not found in ms_user_details', t_user_id;
          END IF;

          IF v_user_balance < v_trade_amount THEN
            RAISE EXCEPTION 'Insufficient balance for user %. Required: ₹%, Available: ₹%', 
              t_user_id, v_trade_amount, v_user_balance;
          END IF;

          -- Deduct cash
          UPDATE ms_user_details
          SET available_cash = available_cash - v_trade_amount
          WHERE user_id = t_user_id;

          -- Create trade entry
          INSERT INTO ms_trades (
            user_id, type, quantity, price, 
            instrument_id, status, order_date
          )
          VALUES (
            t_user_id, 'BUY', t_quantity, v_latest_price,
            v_instrument_id, 'FILLED', t_trade_time
          )
          RETURNING id INTO v_trade_id;

          -- Check for existing lot (with row lock)
          SELECT * INTO v_existing_lot
          FROM ms_open_lots
          WHERE user_id = t_user_id 
            AND instrument_id = v_instrument_id
          FOR UPDATE;

          IF FOUND THEN
            -- Update existing lot with weighted average price
            v_total_quantity := v_existing_lot.quantity + t_quantity;
            v_new_avg_price := (
              (v_existing_lot.quantity * v_existing_lot.buy_price) + 
              (t_quantity * v_latest_price)
            ) / v_total_quantity;

            UPDATE ms_open_lots
            SET 
              quantity = v_total_quantity,
              buy_price = v_new_avg_price
            WHERE user_id = t_user_id 
              AND instrument_id = v_instrument_id;

            v_result := json_build_object(
              'success', true,
              'message', 'BUY executed - lot updated',
              'trade_id', v_trade_id,
              'action', 'updated_lot',
              'symbol', t_symbol,
              'quantity', t_quantity,
              'price', v_latest_price,
              'new_total_quantity', v_total_quantity,
              'new_avg_price', round(v_new_avg_price::numeric, 2)
            );
          ELSE
            -- Create new lot
            INSERT INTO ms_open_lots (
              user_id, instrument_id, buy_date, 
              buy_price, quantity
            )
            VALUES (
              t_user_id, v_instrument_id, t_trade_time,
              v_latest_price, t_quantity
            );

            v_result := json_build_object(
              'success', true,
              'message', 'BUY executed - new lot created',
              'trade_id', v_trade_id,
              'action', 'created_lot',
              'symbol', t_symbol,
              'quantity', t_quantity,
              'price', v_latest_price
            );
          END IF;


        -- SELL LOGIC

        ELSIF t_side = 'SELL' THEN
          -- Check for existing lot (with row lock)
          SELECT * INTO v_existing_lot
          FROM ms_open_lots
          WHERE user_id = t_user_id 
            AND instrument_id = v_instrument_id
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'No open position for user % in % (ID: %)', 
              t_user_id, t_symbol, v_instrument_id;
          END IF;

          IF v_existing_lot.quantity < t_quantity THEN
            RAISE EXCEPTION 'Insufficient quantity for user %. Available: %, Requested: %', 
              t_user_id, v_existing_lot.quantity, t_quantity;
          END IF;

          -- Calculate P&L
          DECLARE
            v_pnl FLOAT := (v_latest_price - v_existing_lot.buy_price) * t_quantity;
          BEGIN
            -- Create trade entry with P&L
            INSERT INTO ms_trades (
              user_id, type, quantity, price, 
              instrument_id, status, order_date, "p&l"
            )
            VALUES (
              t_user_id, 'SELL', t_quantity, v_latest_price,
              v_instrument_id, 'FILLED', t_trade_time, v_pnl
            )
            RETURNING id INTO v_trade_id;

            -- Create closed lot entry
            INSERT INTO ms_closed_lots (
              user_id, lot_id, instrument_id,
              buy_date, buy_price, sell_price, 
              sell_date, quantity
            )
            VALUES (
              t_user_id, v_existing_lot.lot_id, v_instrument_id,
              v_existing_lot.buy_date, v_existing_lot.buy_price,
              v_latest_price, t_trade_time, t_quantity
            );

            -- Update or delete open lot
            IF v_existing_lot.quantity = t_quantity THEN
              -- Full sell - delete lot
              DELETE FROM ms_open_lots
              WHERE user_id = t_user_id 
                AND instrument_id = v_instrument_id;
            ELSE
              -- Partial sell - reduce quantity
              UPDATE ms_open_lots
              SET quantity = quantity - t_quantity
              WHERE user_id = t_user_id 
                AND instrument_id = v_instrument_id;
            END IF;

            -- Add cash back to user
            UPDATE ms_user_details
            SET available_cash = available_cash + v_trade_amount
            WHERE user_id = t_user_id;

            v_result := json_build_object(
              'success', true,
              'message', 'SELL executed',
              'trade_id', v_trade_id,
              'action', 'closed_lot',
              'symbol', t_symbol,
              'quantity', t_quantity,
              'sell_price', v_latest_price,
              'buy_price', v_existing_lot.buy_price,
              'pnl', round(v_pnl::numeric, 2),
              'pnl_percent', round(((v_pnl / (v_existing_lot.buy_price * t_quantity)) * 100)::numeric, 2)
            );
          END;

        ELSE
          RAISE EXCEPTION 'Invalid side: %. Must be BUY or SELL.', t_side;
        END IF;

        -- Append successful result
        v_results := v_results || json_build_array(
          json_build_object(
            'order_id', v_order ->> 'order_id',
            'result', v_result
          )
        );

      EXCEPTION WHEN OTHERS THEN
        -- In atomic mode, re-raise to rollback entire batch
        IF p_atomic THEN
          RAISE;
        ELSE
          -- In non-atomic mode, log error and continue
          v_results := v_results || json_build_array(
            json_build_object(
              'order_id', v_order ->> 'order_id',
              'result', json_build_object(
                'success', false,
                'message', SQLERRM,
                'error_detail', SQLSTATE
              )
            )
          );
        END IF;
      END;
    END LOOP;

    -- Success summary
    RAISE NOTICE 'Batch completed in %ms', 
      EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time));

    RETURN json_build_object(
      'success', true,
      'orders_processed', json_array_length(p_orders),
      'processing_time_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time)),
      'results', v_results
    );

  ELSE
    RAISE EXCEPTION 'Non-atomic mode requires separate implementation';
  END IF;

EXCEPTION WHEN OTHERS THEN
  IF p_atomic THEN
    RAISE NOTICE 'Batch failed, rolling back: %', SQLERRM;
    RAISE; -- Rollback entire transaction
  ELSE
    RETURN json_build_object(
      'success', false,
      'message', 'Batch processing failed',
      'error', SQLERRM,
      'partial_results', v_results
    );
  END IF;
END;
$$ LANGUAGE plpgsql;


*/
