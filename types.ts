import z, { symbol } from "zod"

export interface IorderSchema{
    side:string,
    symbol:string,
    quantity:number,
    trade_time:number
}
export const orderSchema = z.object({
    side:z.string(),
    symbol: z.string(),
    quantity: z.number(),
    trade_time: z.string(),
})