/*
Common for all RPCs
1. Return type JSONB instead of JSON if you need faster indexing/filtering and smaller storage (RETURNS JSONB and use to_jsonb/jsonb_build_object).
2. Limit error detail exposure: avoid returning raw SQLERRM to callers (log it internally instead), to prevent leaking DB internals.
3. Remove the redundant EXISTS or combine checks: do single select and if no row found return User not found.

USER PORTFOLIO Details (SCREEN A , B)
1. Indexing: Ensure indexes on ms_portfolio_history(user_id, updated_at DESC) and ms_open_lots user_id) for performance.
2. Null handling for averagePrice: currently OK because AVG of no rows won't be computed (open lots query returns no rows and instruments -> []). If partial buy_price NULLs exist, consider AVG(ol.buy_price) behavior or AVG(COALESCE(ol.buy_price,0))
depending on intent.
3. Type consistency / naming: API mixes camelCase (0 g. averageoldingTime) and snake case (DBfields). Consider standardizing
4. Security: If this JSON is returned to clients, consider permission checks beyond simple existence (e.g., ensure client has rights to view this user's portfolio).



USER PROFILE Details (SCREEN H,l , K)
1. No need to calculate follower count, following count, already present in ms_user_details
2. No need to return all open_lot portfolio instruments for showing to users. Send on top three instrements with highest investment_value.
3. Performance:
    Indexes recommended on:
        ms_followers(follower_id, following_id)
        ms_market_tags(user_id
        ms_portfolio_history(user_id, updated_at DESC)
        ms_open_lots(user_id)
4. Consistency: JSON keys mix snake_case and camelCase (user_name vs. followersCount). Choose one style for uniform API output.



FOLLOWING A PERSON (SCREEN I)
1. Add a unique constraint on ms_followers(follower_id, following_id) to prevent duplicates:
2. ALTER TABLE ms_followers
    ADD CONSTRAINT ms _followers_unique_pair UNIQUE (follower_id, following_id);
3.Verify both users exist before inserting:
    PERFORM 1 FROM users WHERE id = p_follower_id;
    IF NOT FOUND THEN RETURN ¡son build object'success', false, 'message', 'Follower not found"'); END IF;
    PERFORM 1 FROM users WHERE id = p_following_ id;
    IF NOT FOUND THEN RETURN json_build _object 'success', false, 'message', 'User to follow not found'); END IF;
4. Return richer JSON (e.g., new follower_count / following_count) using RETURNING so caller immediately knows updated totals:
    UPDATE ms_user_details
    SET follower_count = follower_count + 1
    WHERE user_id = p_following_id
    RETURNING follower_count INTO v_new_follower_count;
5. Handle concurrency on counters — UPDATE ... SET col = col + 1 is atomic, but if your usage requires absolute correctness under very high concurrency you may want to SELECT... FOR UPDATE the ms_user_details row first to serialize updates in the transaction.
6. Prefer JSONB for return type if you need downstream indexing or manipulation:
RETURNS JSONB and  use jsonb_build _object.
7. Avoid exposing raw database errors to clients — log SQLERRM server-side and return a generic error message to the caller.
    Example:
    EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'follow_user failed for % -> %: %', P_follower_id, P_following_id, SQLERRM;
    RETURN json_build_object'success', false, 'message', 'Failed to follow user');
    END;
8. Normalize id type (use UUID if your users table uses UUIDs) to avoid implicit casts or mismatched keys. Currently using INT.


GET PARTICULAR INSTRUMENT DETAIL (SCREEN F)
1. No need to return live price as it will directly come from socket
2. Performance Optimization:
    Combine all historical queries into one CTE using date intervals and conditional aggregation instead of six separate
    SELECTS.
        Example: SELECT MAX(close_price) FILTER (WHERE updated_at >= CURRENT_DATE - INTERVAL '1 day') AS close_1d,
    
        Or pre-aggregate historical data into a summary table updated daily.
3. Data Precision:
    Use NUMERIC(12,2) instead of FLOAT for prices to avoid rounding errors.
4. Error Handling:
    Replace raw SQLERRM with a generic message and log internally:
    EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'get_instrument_details error: %', SQLERRM;
    RETURN json_build_object success', false, 'data', NULL, 'message', 'Failed to fetch instrument details');
    END;
5. Consistency:
    Consider returning price_today, buyers_today (snake_case) for uniformity with database field naming or convert all keys to camelCase for API style.
6. Indexing Recommendations:
    ms_stock_performances (instrument_id, updated_at DESC
    Is_stock_realtime _prices instrument_id, created_at DESC)
    These ensure efficient retrieval of recent and historical records.
7. Schema integrity:
    Add a foreign key constraint on ms_stock_performances.instrument_id → ms_instruments.id.
    Extend output:
        Include percent changes (e.g., 1D, 1W ROI) for client display convenience:
        (V_latest_price -v_close_1d) / v_close_1d * 100 AS roi_1d
        JSONB Return Type:
    Switch to RETURNS JSONB for easier querying in downstream APIs.

Trade table (SCREEN B)
1. Remove 'p&l' from 'ms_trades' in both schema and in code. It is not needed.

GET ALL INSTRUMENTS (SCREEN D)
1. Fetch exchange of that instrument
2. No need to fetch close_price and updated_at
    ms_stock_performances (close_price,updated_at)


Edge Function to Receive Orders & Push to SQS
1. There should not be any DB call


cron job
high level 
Every day - keep history of instrument level open-close-high-low price and other details in ms_stock_performances
write a postgreSQL function  that  fill all the details on ms_stock_performances table of each instrument using ms_instruments and ms_stock_realtime_prices table  (has all all instrument todays prices). 
Every day - delete all rows of ms_stock_realtime_prices
that delete all the data of ms_stock_realtime_prices table of today 
make a single postgreSQL rpc function based on the provided schema .
1. Every day - keep history of instrument level open-close-high-low price and other details in ms_stock_performances
write a postgreSQL function  that  fill all the details on ms_stock_performances table of each instrument using ms_instruments and ms_stock_realtime_prices table  (has all all instrument todays prices). 
2. Every day - delete all rows of ms_stock_realtime_prices
that delete all the data of ms_stock_realtime_prices table of today 
keep in mind :-
1. Return type JSONB instead of JSON if you need faster indexing/filtering and smaller storage (RETURNS JSONB and use to_jsonb/jsonb_build_object).
2. Limit error detail exposure: avoid returning raw SQLERRM to callers (log it internally instead), to prevent leaking DB internals.
3. Remove the redundant EXISTS or combine checks: do single select and if no row found return User not found.



2. Every day - all users cronjob- monthly roi, all time roi, win rate, trade etc calculation in ms_portfolio_history
using ms_trades and ms_stock_performances , ms_open_lots , ms_instruments , ms_closed_lots , ms_users table make arpc function that fill all the details on ms_portfolio_history table of each user using ms_trades and ms_stock_performances , ms_open_lots , ms_instruments , ms_closed_lots , ms_users table

*/


/*





1. Indexing: Ensure indexes on ms_portfolio_history(user_id, updated_at DESC) and ms_open_lots user_id) for performance.
2. Indexes recommended on:
        ms_followers(follower_id, following_id)
        ms_market_tags(user_id
        ms_portfolio_history(user_id, updated_at DESC)
        ms_open_lots(user_id)
3. ALTER TABLE ms_followers
    ADD CONSTRAINT ms _followers_unique_pair UNIQUE (follower_id, following_id);
4. Normalize id type (use UUID if your users table uses UUIDs) to avoid implicit casts or mismatched keys. Currently using INT.
5.   Use NUMERIC(12,2) instead of FLOAT for prices to avoid rounding errors.
6.     ms_stock_performances (instrument_id, updated_at DESC
    Is_stock_realtime _prices instrument_id, created_at DESC)
    These ensure efficient retrieval of recent and historical records.
7.   Add a foreign key constraint on ms_stock_performances.instrument_id → ms_instruments.id.
8. 1. Remove 'p&l' from 'ms_trades' in both schema and in code. It is not needed.

take your time and update the schema accordingly ?











update the above rpc function make sure the flow is same and also follow all teh instrunction provided as 
*/
