import { Capacitor, registerPlugin } from '@capacitor/core'

const CalendarBridge = registerPlugin('CalendarBridge')

const isAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** 캘린더 권한 상태 확인 */
export const checkCalendarPermission = async () => {
  if (!isAndroid()) return false
  try {
    const result = await CalendarBridge.checkCalendarPermission()
    return Boolean(result?.granted)
  } catch (e) {
    console.error('[CalendarBridge] checkCalendarPermission 오류:', e)
    return false
  }
}

/** 캘린더 권한 요청 (시스템 팝업) */
export const requestCalendarPermission = async () => {
  if (!isAndroid()) return false
  try {
    const result = await CalendarBridge.requestCalendarPermission()
    return Boolean(result?.granted)
  } catch (e) {
    console.error('[CalendarBridge] requestCalendarPermission 오류:', e)
    return false
  }
}

/**
 * 날짜 범위 내 캘린더 이벤트 조회
 * @param {string} startDate "yyyy-MM-dd" (포함)
 * @param {string} endDate   "yyyy-MM-dd" (미포함)
 * @returns {Object} { "2026-03-22": ["이벤트1", "이벤트2"], ... }
 */
export const getCalendarEventsRange = async (startDate, endDate) => {
  if (!isAndroid()) return {}
  try {
    const result = await CalendarBridge.getEventsRange({ startDate, endDate })
    return result?.events ?? {}
  } catch (e) {
    console.error('[CalendarBridge] getEventsRange 오류:', e)
    return {}
  }
}
