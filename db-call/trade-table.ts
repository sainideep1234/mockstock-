import supabase from "../utils/supabase.js";

async function getPortfolioHistory(userId: number, page: number, pageSize: number) {
  const from = page * pageSize;  // Starting point
  const to = from + pageSize - 1; // Ending point
  
  const { data, error, count } = await supabase
    .from('ms_portfolio_history')
    .select('*', { count: 'exact' }) // Get total count too
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(from, to); // 👈 THIS IS THE MAGIC
  
  if (error) {
    console.error('Error:', error);
    return null;
  }

  return {
    data,
    total: count,
    currentPage: page,
    totalPages: Math.ceil(count! / pageSize),
    hasNextPage: to < count! - 1,
    hasPrevPage: page > 0
  };
}

