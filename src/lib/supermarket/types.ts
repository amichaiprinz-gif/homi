export interface ShoppingInput {
  id: string
  text: string
  quantity: string | null
}

export interface MatchedProduct {
  retailerId: number | string
  name: string
  brand: string | null
  contentText: string | null
  price: number | null
  imageUrl: string | null
  url: string
}

export type OrderLineStatus = 'matched' | 'substituted' | 'missing'

export interface OrderLine {
  itemId: string
  itemText: string
  quantity: string | null
  status: OrderLineStatus
  product: MatchedProduct | null
  /** Set for substituted lines — brief explanation of why this isn't exact */
  note: string | null
}

export interface PreparedOrder {
  retailer: string
  retailerName: string
  retailerUrl: string
  lines: OrderLine[]
  /** Sum of matched/substituted line prices, null if none had prices */
  estimatedTotal: number | null
  preparedAt: string
}
