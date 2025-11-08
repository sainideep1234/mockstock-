import supabase from "../utils/supabase.js";

// Frontend code
const addToWatchlist = async (userId: number, instrumentId: number) => {
  const { data, error } = await supabase

    .from('ms_watchlist')
    .insert({
      user_id: userId,
      instrument_id: instrumentId,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    // Handle duplicate (already in watchlist)
    if (error.code === '23505') {
      return {
        success: false,
        message: 'Already in watchlist'
      };
    }
    throw error;
  }

  return {
    success: true,
    message: 'Added to watchlist',
    data
  };
};


// Frontend code - Get watchlist with full instrument details
const getWatchlist = async (userId: number) => {
  const { data, error } = await supabase
    .from('ms_watchlist')
    .select(`
      id,
      created_at,
      instrument_id,
      ms_instruments (
        id,
        name,
        symbol,
        exchange,
        industry,
        ms_stock_realtime_prices (
          last_traded_price,
          created_at
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw "error";

  // Transform to cleaner format
  return {
    success: true,
    data: data.map(item => ({
      watchlistId: item.id,
      addedAt: item.created_at,
      instrument: {
        id: item.ms_instruments.id,
        name: item.ms_instruments.name,
        symbol: item.ms_instruments.symbol,
        exchange: item.ms_instruments.exchange,
        industry: item.ms_instruments.industry,
        currentPrice: item.ms_instruments.ms_stock_realtime_prices?.[0]?.last_traded_price || null
      }
    }))
  };
};

// Frontend code - Delete by instrument_id
const removeFromWatchlist = async (userId: number, instrumentId: number) => {
  const { error } = await supabase
    .from('ms_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('instrument_id', instrumentId);

  if (error) throw error;

  return {
    success: true,
    message: 'Removed from watchlist'
  };
};

// OR delete by watchlist ID (if you have it)
const removeFromWatchlistById = async (userId: number, watchlistId: number) => {
  const { error } = await supabase
    .from('ms_watchlist')
    .delete()
    .eq('id', watchlistId)
    .eq('user_id', userId); // Security: ensure user owns this watchlist item

  if (error) throw error;

  return {
    success: true,
    message: 'Removed from watchlist'
  };
};