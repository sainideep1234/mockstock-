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
        ms_stock_performances (
          close_price_1d,
          updated_at
        )
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
        close_price_1d: latestPerformance?.close_price_1d?.toString() || '0',
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

// Usage
const allInstruments = await getAllInstruments()
console.log(allInstruments)