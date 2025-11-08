import supabase from "../utils/supabase.js"


async function getInstrumentDetail(symbol: string) {
  try {
    // Step 1: Get instrument basic info
    const { data: instrument, error: instrumentError } = await supabase
      .from('ms_instruments')
      .select(`
        symbol,
        name,
        exchange,
        industry,
        ms_stock_performances (
          open_price,
          buyers_today,
          sellers_today,
          current_holders,
          close_price_1d,
          close_price_1w,
          close_price_1m,
          close_price_6m,
          close_price_1y,
          close_price_all,
          updated_at
        )
      `)
      .eq('symbol', symbol)
      .single()  // Get only one result

    if (instrumentError) {
      return {
        success: false,
        data: null,
        message: instrumentError.message
      }
    }

    // If no instrument found
    if (!instrument) {
      return {
        success: false,
        data: null,
        message: 'Instrument not found'
      }
    }

    // Step 2: Get the latest performance data
    // ms_stock_performances returns array, we need the latest one
    const latestPerformance = instrument.ms_stock_performances?.[0] || null

    // Step 3: Format response in your desired structure
    const response = {
      success: true,
      data: {
        symbol: instrument.symbol,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.industry || 'N/A',
        priceToday: latestPerformance?.open_price || 0,
        buyersToday: latestPerformance?.buyers_today || 0,
        sellersToday: latestPerformance?.sellers_today || 0,
        currentHolders: latestPerformance?.current_holders || 0,
        close_price_1d: latestPerformance?.close_price_1d || 0,
        close_price_1w: latestPerformance?.close_price_1w || 0,
        close_price_1m: latestPerformance?.close_price_1m || 0,
        close_price_1y: latestPerformance?.close_price_1y || 0,
        close_price_6m: latestPerformance?.close_price_6m || 0,
        close_price_all: latestPerformance?.close_price_all || 0
      },
      message: 'fetched instrument successfully'
    }

    return response

  } catch (error) {
    return {
      success: false,
      data: null,
      message: error.message || 'Something went wrong'
    }
  }
}

// Usage
const result = await getInstrumentDetail('REL')
console.log(result)