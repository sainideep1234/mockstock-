import supabase from "../utils/supabase.js";

// ============================================================
// Function: Get Trade History (Paginated)
// ============================================================
// Fetches user's trade history from ms_trades table
// Joins with ms_instruments to get stock details
// ============================================================

async function getTradeHistory(
  userId: string,  // UUID (changed from number)
  page: number, 
  pageSize: number
) {
  const from = page * pageSize;       // Starting point
  const to = from + pageSize - 1;     // Ending point
  
  const { data, error, count } = await supabase
    .from('ms_trades')
    .select(`
      id,
      quantity,
      price,
      type,
      order_date,
      ms_instruments (
        symbol,
        name
      )
    `, { count: 'exact' })  // Get total count too
    .eq('user_id', userId)
    .order('order_date', { ascending: false })  // Latest first
    .range(from, to);  // Pagination magic
  
  if (error) {
    console.error('Error:', error);
    return {
      success: false,
      data: [],
      total: 0,
      currentPage: page,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false
    };
  }

  // Transform data to match your response format
  const transformedData = data?.map(trade => ({
    quantity: trade.quantity,
    orderId: trade.id,
    price: parseFloat(trade.price),  // Convert NUMERIC to number
    time: formatDateTime(trade.order_date),  // Format date
    side: trade.type,  // 'BUY' or 'SELL'
    symbol: trade.ms_instruments?.symbol || 'N/A',
    name: trade.ms_instruments?.name || 'N/A'
  })) || [];

  return {
    success: true,
    data: transformedData,
    total: count || 0,
    currentPage: page,
    totalPages: Math.ceil((count || 0) / pageSize),
    hasNextPage: to < (count || 0) - 1,
    hasPrevPage: page > 0
  };
}


function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  const year = date.getFullYear();
  
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;  // Convert 24h to 12h format
  
  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

