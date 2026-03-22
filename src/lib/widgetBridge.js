import { Capacitor, registerPlugin } from '@capacitor/core'

const WidgetBridge = registerPlugin('WidgetBridge')

export const syncWidgetSnapshot = async ({
  monthLabel,
  monthCellsJson,
  prevMonthLabel = '',
  prevMonthCellsJson = '[]',
  nextMonthLabel = '',
  nextMonthCellsJson = '[]',
  todayDateLabel = '',
  todayNotesJson = '[]',
}) => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return
  }

  try {
    await WidgetBridge.syncWidgetData({
      monthLabel,
      monthCellsJson,
      prevMonthLabel,
      prevMonthCellsJson,
      nextMonthLabel,
      nextMonthCellsJson,
      todayDateLabel,
      todayNotesJson,
    })
  } catch {
    // Native widget plugin may not be ready in web context. Ignore safely.
  }
}
