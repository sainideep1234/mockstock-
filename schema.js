/*
users {
  id uuid pk 
  name string
  user_name string 
  created_at dateTime 
  available_cash numeric(12,2) default 0
  city string
  aadhar_verified_at dateTime
  aadhar_verified boolean
  aadhar_otp int
  email string unique
  gender string
  work_email string 
  work_email_verified_at dateTime
  company string
  location string
  work_email_otp int 
  user_public_id string unique
  age int
}
// Index: users(email), users(user_public_id)

ms_followers {
  id int pk 
  follower_id uuid fk
  following_id uuid fk
}
// Unique constraint: (follower_id, following_id)
// Index: ms_followers(follower_id, following_id)

ms_user_details { 
  user_id uuid pk fk
  market_tags string
  follower_count int default 0
  following_count int default 0
}

ms_market_tags {
  id int pk 
  name string
  user_id uuid fk
}
// Values: NEWBIE, FINANCIAL_TRADER, FINANCIAL_EXPERT
// Index: ms_market_tags(user_id)

ms_trades {
  id int pk 
  user_id uuid fk
  type string
  quantity int
  price numeric(12,2)
  instrument_id int fk
  status string
  order_date dateTime
}
// type: BUY, SELL
// status: PENDING, PARTIAL, FILLED, CANCELLED
// Index: ms_trades(user_id, order_date DESC)
// Index: ms_trades(instrument_id, order_date DESC)

ms_portfolio_history {
  id int pk 
  user_id uuid fk
  portfolio_value numeric(12,2)
  cash_in numeric(12,2)
  cash_out numeric(12,2)
  roi_1d numeric(8,2)
  roi_1w numeric(8,2)
  roi_1m numeric(8,2)
  roi_6m numeric(8,2)
  roi_1y numeric(8,2)
  roi_1ytd numeric(8,2)
  roi_all numeric(8,2)
  rank_1d int 
  rank_1w int 
  rank_1m int 
  rank_6m int 
  rank_1y int 
  rank_all int 
  win_rate numeric(5,2)
  total_trades int default 0
  average_holding_days int
  current_holding int default 0
  updated_at dateTime
}
// Index: ms_portfolio_history(user_id, updated_at DESC)
// Index: ms_portfolio_history(updated_at, rank_all)

ms_open_lots {
  id int pk 
  user_id uuid fk
  instrument_id int fk
  buy_date dateTime
  buy_price numeric(12,2)
  quantity int
}
// Index: ms_open_lots(user_id, instrument_id)
// Index: ms_open_lots(instrument_id)

ms_closed_lots {
  id int pk 
  user_id uuid fk
  lot_id int
  instrument_id int fk
  buy_date dateTime
  buy_price numeric(12,2)
  sell_price numeric(12,2)
  sell_date dateTime
  quantity int
  pnl numeric(12,2)
}
// pnl = (sell_price - buy_price) * quantity
// Index: ms_closed_lots(user_id, sell_date DESC)

ms_watchlist {
  id int pk 
  user_id uuid fk
  instrument_id int fk
  created_at dateTime
}
// Index: ms_watchlist(user_id)
// Unique constraint: (user_id, instrument_id)

ms_instruments {
  id int pk 
  name string
  exchange string
  symbol string unique
  industry string
  premium_level string
}
// Index: ms_instruments(symbol)
// Index: ms_instruments(exchange, symbol)

ms_stock_performances {
  id int pk 
  instrument_id int fk
  updated_at date
  buyers_today int default 0
  sellers_today int default 0
  current_holders int default 0
  open_price numeric(12,2)
  close_price numeric(12,2)
  high_price numeric(12,2)
  low_price numeric(12,2)
}
// Unique constraint: (instrument_id, updated_at)
// Index: ms_stock_performances(instrument_id, updated_at DESC)
// Index: ms_stock_performances(updated_at)

ms_stock_realtime_prices {
  id int pk
  symbol string
  hhmmss time
  created_at dateTime
  last_traded_price numeric(12,2)
  instrument_id int fk
}
// Index: ms_stock_realtime_prices(instrument_id, created_at DESC)
// Index: ms_stock_realtime_prices(created_at)

// Relationships
users.id < ms_portfolio_history.user_id  
users.id < ms_trades.user_id
users.id < ms_followers.follower_id 
users.id < ms_followers.following_id 
users.id - ms_user_details.user_id 
users.id < ms_market_tags.user_id
users.id < ms_closed_lots.user_id
users.id < ms_open_lots.user_id
users.id < ms_watchlist.user_id

ms_instruments.id < ms_open_lots.instrument_id
ms_instruments.id < ms_stock_performances.instrument_id
ms_instruments.id < ms_closed_lots.instrument_id
ms_instruments.id < ms_stock_realtime_prices.instrument_id
ms_instruments.id < ms_watchlist.instrument_id
ms_instruments.id < ms_trades.instrument_id


*/