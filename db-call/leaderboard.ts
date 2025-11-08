import supabase from "../utils/supabase.js";

async function getLeaderboard(
  period: string,
  limit: number,
  page: number
): Promise<{ success: boolean; data?: any; error?: any }> {
  
  // 🛡️ CRITICAL: Whitelist validation (prevent SQL injection)
  const validPeriods = ['1d', '1w', '1m', '6m', '1y', 'ytd', 'all'];
  if (!validPeriods.includes(period)) {
    return {
      success: false,
      error: { message: 'Invalid period provided' }
    };
  }

  const offset = (page - 1) * limit;

  // Build the select string
  const selectQuery = `
    roi_${period},
    rank_${period},
    users!inner (
      name,
      user_name
    )
  `.trim();

  const { data, error } = await supabase
    .from("ms_portfolio_history")
    .select(selectQuery)
    .not(`rank_${period}`, 'is', null)  // Only users with rank
    .order(`rank_${period}`, { ascending: true })  // 🔥 FIXED: ascending!
    .range(offset, offset + limit - 1);

  if (error) {
    return {
      success: false,
      error,
    };
  }

  // Transform data to consistent format
  const formattedData = data?.map(row => ({
    roi: row[`roi_${period}`],
    rank: row[`rank_${period}`],
    name: row.users.name,
    username: row.users.user_name
  }));

  return {
    success: true,
    data: formattedData,
  };
}

export default getLeaderboard;

