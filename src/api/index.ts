import { API_BASE_URL } from '../config'
import { createHttpApi } from './http'
import { createMockApi } from './mock'
import type { Api } from './types'

export const api: Api = API_BASE_URL ? createHttpApi(API_BASE_URL) : createMockApi()

export { ApiError } from './types'
export type * from './types'
