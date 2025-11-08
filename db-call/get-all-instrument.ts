import supabase from "../utils/supabase.js"

async function getAllInstruments() {
  try {
    // Fetch all instruments with their latest performance
    const { data: instruments, error } = await supabase
      .from('ms_instruments')
      .select(`
        symbol,
        name,
        industry,
      `)
      .order('name', { ascending: true })  // Alphabetically sorted

    if (error) {
      return {
        success: false,
        data: []
      }
    }

    // Format the data
    const formattedData = instruments.map(instrument => {
      // Get latest performance (assuming array is ordered by updated_at DESC)
      const latestPerformance = instrument.ms_stock_performances?.[0]

      return {
        symbol: instrument.symbol,
        name: instrument.name,
        industry: instrument.industry || 'N/A'
      }
    })

    return {
      success: true,
      data: formattedData
    }

  } catch (error) {
    return {
      success: false,
      data: []
    }
  }
}

