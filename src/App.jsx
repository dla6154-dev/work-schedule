import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Home,
  MousePointer2,
  Pencil,
  Plus,
  Settings,
  Share2,
  Star,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import {
  ensureAnonymousAuth,
  ensureSplitSharedState,
  isFirebaseConfigured,
  saveSharedState,
  subscribeAuth,
  subscribeSharedState,
} from './lib/supabase'
import { APP_VERSION } from './version'
import { syncWidgetSnapshot } from './lib/widgetBridge'
import html2canvas from 'html2canvas'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import {
  checkCalendarPermission,
  getCalendarEventsRange,
  requestCalendarPermission,
} from './lib/calendarBridge'

const COLOR_OPTIONS = [
  {
    bg: 'bg-rose-50',
    text: 'text-rose-400',
    border: 'border-rose-100',
    dotBg: 'bg-rose-400',
    dotBorder: 'border-rose-400',
  },
  {
    bg: 'bg-orange-50',
    text: 'text-orange-400',
    border: 'border-orange-100',
    dotBg: 'bg-orange-400',
    dotBorder: 'border-orange-400',
  },
  {
    bg: 'bg-amber-50',
    text: 'text-amber-400',
    border: 'border-amber-100',
    dotBg: 'bg-amber-400',
    dotBorder: 'border-amber-400',
  },
  {
    bg: 'bg-emerald-50',
    text: 'text-emerald-400',
    border: 'border-emerald-100',
    dotBg: 'bg-emerald-400',
    dotBorder: 'border-emerald-400',
  },
  {
    bg: 'bg-sky-50',
    text: 'text-sky-400',
    border: 'border-sky-100',
    dotBg: 'bg-sky-400',
    dotBorder: 'border-sky-400',
  },
  {
    bg: 'bg-indigo-50',
    text: 'text-indigo-400',
    border: 'border-indigo-100',
    dotBg: 'bg-indigo-400',
    dotBorder: 'border-indigo-400',
  },
  {
    bg: 'bg-violet-50',
    text: 'text-violet-400',
    border: 'border-violet-100',
    dotBg: 'bg-violet-400',
    dotBorder: 'border-violet-400',
  },
  {
    bg: 'bg-slate-50',
    text: 'text-slate-400',
    border: 'border-slate-100',
    dotBg: 'bg-slate-400',
    dotBorder: 'border-slate-400',
  },
]

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const PERIOD_HIGHLIGHT_STYLES = [
  { cell: 'bg-emerald-50', band: 'bg-emerald-100/70', text: 'text-emerald-400' },
  { cell: 'bg-green-50', band: 'bg-green-100/70', text: 'text-green-400' },
  { cell: 'bg-teal-50', band: 'bg-teal-100/70', text: 'text-teal-400' },
  { cell: 'bg-lime-50', band: 'bg-lime-100/70', text: 'text-lime-500' },
  { cell: 'bg-emerald-50', band: 'bg-emerald-100/70', text: 'text-emerald-400' },
  { cell: 'bg-green-50', band: 'bg-green-100/70', text: 'text-green-400' },
  { cell: 'bg-teal-50', band: 'bg-teal-100/70', text: 'text-teal-400' },
  { cell: 'bg-lime-50', band: 'bg-lime-100/70', text: 'text-lime-500' },
]
const CALENDAR_CELL_HEIGHT = 99.2
const COLUMN_TEXT_OFFSET_X = 11
const REGISTRATION_POPUP_SPACE = 320
const SHARED_STATE_SAVE_DEBOUNCE_MS = 1200
const REGISTRATION_SAFE_GAP = 88
const MAIN_IDLE_BOTTOM_SPACE = 12
const MAIN_SCROLLBAR_HIDE_DELAY_MS = 800
const WORK_TYPE_REORDER_LONG_PRESS_MS = 320
const SPOTLIGHT_CARD_EDGE_GAP = 14
const SPOTLIGHT_CARD_TOP_SAFE_GAP = 68
const SPOTLIGHT_CARD_BOTTOM_SAFE_GAP = 84
const SPOTLIGHT_TARGET_GAP = 12
const SPOTLIGHT_OVERLAY_MASK_ID = 'spotlight-overlay-mask'
const PROFILE_STORAGE_KEY = 'work-widget-user-profile-v1'
const APP_STORAGE_KEY = 'work-widget-app-state-v1'
const LOCAL_TO_SHARED_MIGRATION_KEY = 'work-widget-local-to-shared-migrated-v1'
const CENTER_DISPATCH_SITE_ID = 'dispatch-center'
const MAIN_SECTION_ID = 'main'
const FAVORITES_SECTION_ID = 'favorites'
const ONBOARDING_PREVIEW_QUERY_KEY = 'onboardingPreview'
const ONBOARDING_TUTORIAL_DATA_QUERY_KEY = 'tutorialData'
const ONBOARDING_COMPLETED_STORAGE_KEY = 'work-widget-onboarding-completed-v1'
const ONBOARDING_SPOTLIGHT_STEPS = [
  {
    id: 'profileRegistration',
    targetId: 'tour-profile-modal-panel',
    title: '사용자 정보 등록',
    description: '이름, 센터, 근무지를 먼저 등록합니다. 계정은 이름과 센터 조합으로 구분됩니다.',
    highlight: '하단에서 올라오는 사용자 정보 등록 폼에서 정보를 입력합니다.',
    points: ['① 이름 입력', '② 센터 선택', '③ 근무지 선택 후 저장'],
    caution: '센터가 목록에 없으면 임시 센터를 선택한 뒤 센터 설정에서 신규 센터를 등록하세요.',
    icon: User,
  },
  {
    id: 'scheduleRegistrationMode',
    targetId: 'tour-note-mode-button',
    secondaryTargetId: 'tour-registration-popup',
    title: '일정 등록 모드',
    description: '일일 일정(출장, 회의)과 기간 일정(특별수송 기간)을 등록할 수 있습니다.',
    highlight: '등록된 내용은 해당 센터 내에만 표출됩니다.',
    points: ['일일 일정 등록/삭제', '기간 일정 등록/삭제', '선택한 센터에만 표출'],
    icon: CalendarDays,
  },
  {
    id: 'workRegistrationMode',
    targetId: 'tour-work-mode-button',
    secondaryTargetId: 'tour-registration-popup',
    title: '근무 등록',
    description: '선택한 날짜부터 선택한 근무지 기준으로 근무를 등록할 수 있습니다.',
    highlight: "'+' 버튼으로 모드를 열고, 아래 등록창에서 근무형태를 선택합니다.",
    points: ['날짜 선택', '근무형태 선택', '자동으로 다음 날짜 이동'],
    caution: '근무형태가 없으면 근무형태 관리에서 먼저 생성하세요.',
    icon: Plus,
  },
  {
    id: 'workStatusCheck',
    targetId: 'tour-status-modal-panel',
    title: '근무 확인',
    description: '날짜를 누르면 해당 날짜의 일정과 근무자/근무형태를 확인할 수 있습니다.',
    highlight: '',
    points: ['날짜별 일정 확인', '근무자 이름 확인', '근무형태 확인'],
    icon: MousePointer2,
  },
  {
    id: 'centerDispatchSettings',
    targetId: 'tour-center-manage-modal-panel',
    title: '센터/근무지 설정',
    description: "'센터 설정'에서 신규 센터와 근무지(파견지)를 등록할 수 있습니다.",
    highlight: '근무 등록 창의 센터 설정 버튼으로 관리 화면을 엽니다.',
    points: ['신규 센터 등록', '근무지(파견지) 등록', '센터/근무지 수정/삭제'],
    caution: '센터는 기본 근무지로 자동 등록되므로 추가 파견지만 등록하면 됩니다.',
    icon: Settings,
  },
  {
    id: 'workTypeManagement',
    targetId: 'tour-worktype-manage-modal-panel',
    title: '근무형태 관리',
    description: "'근무형태'에서 센터/근무지별 근무형태와 색상을 관리합니다.",
    highlight: '근무형태 버튼에서 생성, 수정, 삭제를 진행합니다.',
    points: ['근무형태 생성', '근무형태 수정/삭제', '색상 설정'],
    caution: '동일 센터/동일 근무지 사용자에게 동일한 근무형태와 색상이 적용됩니다.',
    icon: Pencil,
  },
  {
    id: 'favoritesComparison',
    targetId: 'tour-favorites-user-picker-button',
    title: '즐겨찾기',
    description: '등록된 사용자 중 필요한 인원만 선택해 내 근무와 비교할 수 있습니다.',
    highlight: "'사용자 선택'에서 비교할 사용자를 선택합니다.",
    points: ['즐겨찾기 사용자 선택', '내 근무와 대조', '필요 인원만 빠르게 조회'],
    icon: Star,
  },
]
const getDispatchLabelText = (siteName) => siteName.replace(/근무지$/, '') || siteName

const DEFAULT_CENTERS = [
  { id: 'center-mokpo', name: '목포센터' },
  { id: 'center-wando', name: '완도센터' },
]

const DEFAULT_DISPATCH_SITES = [
  { id: 'dispatch-mokpo-namgang', centerId: 'center-mokpo', name: '남강' },
  { id: 'dispatch-mokpo-jindo', centerId: 'center-mokpo', name: '진도' },
  { id: 'dispatch-mokpo-bukhang', centerId: 'center-mokpo', name: '북항' },
  { id: 'dispatch-mokpo-haui', centerId: 'center-mokpo', name: '하의' },
  { id: 'dispatch-mokpo-docho', centerId: 'center-mokpo', name: '도초' },
]

const DEFAULT_WORK_TYPES = [
  {
    id: 'type-mokpo-early-a',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '조출A',
    colorIdx: 0,
  },
  {
    id: 'type-mokpo-early-b',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '조출B',
    colorIdx: 1,
  },
  {
    id: 'type-mokpo-early-c',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '조출C',
    colorIdx: 2,
  },
  {
    id: 'type-mokpo-early-d',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '조출D',
    colorIdx: 3,
  },
  {
    id: 'type-mokpo-early-e',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '조출E',
    colorIdx: 4,
  },
  {
    id: 'type-mokpo-normal',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '정상',
    colorIdx: 5,
  },
  {
    id: 'type-mokpo-extend-a',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '연장A',
    colorIdx: 6,
  },
  {
    id: 'type-mokpo-extend-b1',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '연장B1',
    colorIdx: 7,
  },
  {
    id: 'type-mokpo-extend-b2',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '연장B2',
    colorIdx: 4,
  },
  {
    id: 'type-mokpo-namgang',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '남강',
    colorIdx: 3,
  },
  {
    id: 'type-mokpo-jindo-a',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '근무A(진도)',
    colorIdx: 1,
  },
  {
    id: 'type-mokpo-jindo-b',
    centerId: 'center-mokpo',
    dispatchSiteId: CENTER_DISPATCH_SITE_ID,
    label: '근무B(진도)',
    colorIdx: 3,
  },
]

const MOCK_NAMES = [
  '김민준',
  '이서연',
  '박지훈',
  '최유진',
  '정현우',
  '한지민',
  '오승현',
  '윤하은',
  '강도윤',
  '서지아',
  '조민재',
  '송예린',
]
const STATUS_PREVIEW_NORMAL_NAMES = ['김민준', '이서연', '박지훈', '최유진', '정현우', '한지민']
const STATUS_PREVIEW_OFF_NAMES = ['오승현', '윤하은', '강도윤', '서지아', '조민재', '송예린']
const STATUS_PREVIEW_JINDO_A_NAMES = ['진도A-1', '진도A-2']
const STATUS_PREVIEW_JINDO_B_NAMES = ['진도B-1', '진도B-2']
const STATUS_PREVIEW_NAMGANG_A_NAMES = ['남강A-1', '남강A-2']
const STATUS_PREVIEW_NAMGANG_B_NAMES = ['남강B-1', '남강B-2']
const STATUS_PREVIEW_FILL_NAMES = [
  '홍길동',
  '김철수',
  '이영희',
  '박민수',
  '최지은',
  '한수진',
  '장민호',
  '오세훈',
  '정하늘',
  '서유진',
]

const formatDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

const formatDatePickerLabel = (value) => {
  if (!isYmdDateString(value)) return '날짜 선택'
  const [year, month, day] = value.split('-')
  return `${year}. ${month}. ${day}`
}

const WIDGET_SHIFT_COLORS = [
  '#FB7185',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#38BDF8',
  '#3B82F6',
  '#8B5CF6',
  '#94A3B8',
]

const normalizeDailyNoteEntry = (note, fallbackId = '') => {
  if (typeof note === 'string') {
    const trimmed = note.trim()
    if (!trimmed) return null
    return {
      id: fallbackId || `legacy-note-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      centerId: '',
    }
  }

  if (!note || typeof note !== 'object') return null

  const rawText =
    typeof note.text === 'string'
      ? note.text
      : typeof note.label === 'string'
        ? note.label
        : ''
  const trimmedText = rawText.trim()
  if (!trimmedText) return null

  return {
    id:
      typeof note.id === 'string' && note.id
        ? note.id
        : fallbackId || `legacy-note-${Math.random().toString(36).slice(2, 7)}`,
    text: trimmedText,
    centerId: typeof note.centerId === 'string' ? note.centerId : '',
  }
}

const getCenterScopedManualNoteEntries = (notes, centerId) => {
  if (!Array.isArray(notes) || !centerId) return []
  return notes
    .map((note, idx) => normalizeDailyNoteEntry(note, `legacy-note-${idx}`))
    .filter((note) => note && note.centerId === centerId)
}

const getCenterScopedManualNoteTexts = (notes, centerId) =>
  getCenterScopedManualNoteEntries(notes, centerId).map((note) => note.text)

const buildCenterScopedDailyNotesMap = (dailyNotes, centerId) => {
  if (!dailyNotes || typeof dailyNotes !== 'object' || Array.isArray(dailyNotes) || !centerId) return {}

  return Object.entries(dailyNotes).reduce((acc, [dateStr, notes]) => {
    if (!isYmdDateString(dateStr) || !Array.isArray(notes)) return acc
    const scopedNotes = getCenterScopedManualNoteTexts(notes, centerId)
    if (scopedNotes.length) acc[dateStr] = scopedNotes
    return acc
  }, {})
}

const getPeriodCenterId = (period) => (typeof period?.centerId === 'string' ? period.centerId : '')

const mergeEntitiesById = (baseItems = [], localItems = []) => {
  const merged = Array.isArray(baseItems) ? [...baseItems] : []
  const idSet = new Set(
    merged
      .filter((item) => item && typeof item.id === 'string' && item.id)
      .map((item) => item.id),
  )

  ;(Array.isArray(localItems) ? localItems : []).forEach((item) => {
    if (!item || typeof item !== 'object') return
    if (typeof item.id !== 'string' || !item.id) return
    if (idSet.has(item.id)) return
    merged.push(item)
    idSet.add(item.id)
  })

  return merged
}

const mergeDailyNotesForMigration = (baseDailyNotes = {}, localDailyNotes = {}) => {
  const merged = { ...(baseDailyNotes || {}) }

  Object.entries(localDailyNotes || {}).forEach(([dateStr, localNotes]) => {
    if (!isYmdDateString(dateStr) || !Array.isArray(localNotes)) return

    const baseNotes = Array.isArray(merged[dateStr]) ? merged[dateStr] : []
    const normalizedBaseNotes = baseNotes.reduce((acc, note, idx) => {
      const normalized = normalizeDailyNoteEntry(note, `base-note-${dateStr}-${idx}`)
      if (normalized) acc.push(normalized)
      return acc
    }, [])
    const seenNoteKeys = new Set(normalizedBaseNotes.map((note) => `${note.centerId}::${note.text}`))
    const nextNotes = [...normalizedBaseNotes]

    localNotes.forEach((note, idx) => {
      const normalized = normalizeDailyNoteEntry(note, `migrate-note-${dateStr}-${idx}`)
      if (!normalized) return
      if (normalized.id && normalized.id.includes('demo')) return
      const noteKey = `${normalized.centerId}::${normalized.text}`
      if (seenNoteKeys.has(noteKey)) return
      seenNoteKeys.add(noteKey)
      nextNotes.push(normalized)
    })

    if (nextNotes.length) {
      merged[dateStr] = nextNotes
    }
  })

  return merged
}

const getPeriodSignature = (item) =>
  `${getPeriodCenterId(item)}::${item.startDate || ''}::${item.endDate || ''}::${(
    item.label || ''
  ).trim()}`

const mergePeriodSchedulesForMigration = (baseSchedules = [], localSchedules = []) => {
  const merged = Array.isArray(baseSchedules) ? [...baseSchedules] : []
  const idSet = new Set(
    merged
      .filter((item) => item && typeof item.id === 'string' && item.id)
      .map((item) => item.id),
  )
  const signatureSet = new Set(merged.map((item) => getPeriodSignature(item)))

  ;(Array.isArray(localSchedules) ? localSchedules : []).forEach((item) => {
    if (!item || typeof item !== 'object') return
    if (typeof item.id !== 'string' || !item.id) return
    if (item.id.includes('demo')) return
    if (!isYmdDateString(item.startDate) || !isYmdDateString(item.endDate)) return
    if (typeof item.label !== 'string' || !item.label.trim()) return

    const normalized = {
      id: item.id,
      label: item.label.trim(),
      startDate: item.startDate,
      endDate: item.endDate,
      centerId: getPeriodCenterId(item),
    }

    const signature = getPeriodSignature(normalized)
    if (idSet.has(normalized.id) || signatureSet.has(signature)) return

    merged.push(normalized)
    idSet.add(normalized.id)
    signatureSet.add(signature)
  })

  return merged
}

const mergeUniqueNotes = (...noteGroups) => {
  const merged = []
  noteGroups.forEach((notes) => {
    if (!Array.isArray(notes)) return
    notes.forEach((note) => {
      const normalizedNote = normalizeDailyNoteEntry(note)
      const trimmed = normalizedNote?.text || (typeof note === 'string' ? note.trim() : '')
      if (!trimmed) return
      if (!merged.includes(trimmed)) merged.push(trimmed)
    })
  })
  return merged
}

const buildWidgetMonthCells = ({
  year,
  month,
  mySchedules,
  workTypeMap,
  dailyNotes,
  periodSchedules,
  holidayNotesByDate = {},
  calendarEventsByDate = {},
  todayStr,
}) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const prevMonthDays = new Date(year, month, 0).getDate()
  const cells = []

  for (let idx = 0; idx < 42; idx += 1) {
    const day = idx - firstWeekday + 1
    const dayOfWeek = idx % 7
    if (day < 1 || day > daysInMonth) {
      const isPrevMonth = day < 1
      const outsideDay = isPrevMonth ? prevMonthDays + day : day - daysInMonth
      cells.push({
        inMonth: false,
        isPeriod: false,
        isToday: false,
        dayText: String(outsideDay),
        shiftText: '',
        noteText: '',
        dayColor: '#CBD5E1',
        shiftColor: '#334155',
        noteColor: '#64748B',
        dateStr: '',
      })
      continue
    }

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const typeId = mySchedules[dateStr]
    const shiftType = typeId ? workTypeMap.get(typeId) : null
    const shiftColor = shiftType
      ? WIDGET_SHIFT_COLORS[shiftType.colorIdx % WIDGET_SHIFT_COLORS.length] || '#334155'
      : '#94A3B8'
    const holidayNotes = holidayNotesByDate[dateStr] ?? []
    const dayColor =
      holidayNotes.length > 0 ? '#FB7185' : dayOfWeek === 0 ? '#FB7185' : dayOfWeek === 6 ? '#3B82F6' : '#1E293B'
    const dayNotes = mergeUniqueNotes(holidayNotes, dailyNotes[dateStr] ?? [])
    const period = periodSchedules.find((item) => isDateInRange(dateStr, item.startDate, item.endDate))
    // 노트가 공휴일에서 왔는지 여부 (기간 일정은 제외)
    const isHoliday = !period && holidayNotes.length > 0

    const calendarEvents = calendarEventsByDate[dateStr] ?? []
    // 기존 노트와 중복되는 캘린더 이벤트 제거
    const existingLabelsLower = dayNotes.map((n) => n.toLowerCase())
    const filteredCalEvents = calendarEvents.filter((ev) => {
      const evLower = ev.toLowerCase()
      return !existingLabelsLower.some((n) => n === evLower || n.includes(evLower))
    })
    // 셀 카드에 표시할 첫 번째 노트 (공휴일/일반 노트 없으면 캘린더 이벤트)
    const firstNote = dayNotes[0] || filteredCalEvents[0] || ''
    const allNoteItems = []
    if (period) allNoteItems.push({ label: period.label, kind: 'period' })
    dayNotes.forEach((n) => allNoteItems.push({ label: n, kind: holidayNotes.includes(n) ? 'holiday' : 'note' }))
    filteredCalEvents.forEach((ev) => allNoteItems.push({ label: ev, kind: 'calendar' }))

    // firstNote가 캘린더 이벤트에서 왔는지 여부
    const isCalendarNote = !period && dayNotes.length === 0 && filteredCalEvents.length > 0
    // 전체 노트 수 (첫 번째 제외한 나머지 개수 → +N 표시용)
    const noteCount = allNoteItems.length
    cells.push({
      inMonth: true,
      isPeriod: Boolean(period),
      isToday: dateStr === todayStr,
      isHoliday,
      isCalendarNote,
      dayText: String(day),
      shiftText: shiftType?.label || '',
      noteText: firstNote,
      noteCount,
      dayColor,
      shiftColor,
      noteColor: '#64748B',
      dateStr,
      allNotes: allNoteItems,
    })
  }

  return cells
}

const buildWidgetTodayNotes = ({ todayStr, dailyNotes, periodSchedules, holidayNotesByDate = {} }) => {
  if (!isYmdDateString(todayStr)) return []

  const holidayNotes = holidayNotesByDate[todayStr] ?? []
  const holidaySet = new Set(holidayNotes)
  const periodNotes = periodSchedules
    .filter((item) => isDateInRange(todayStr, item.startDate, item.endDate))
    .map((item) => item.label)
  const mergedNotes = mergeUniqueNotes(
    holidayNotes,
    periodNotes,
    dailyNotes[todayStr] ?? [],
  )

  return mergedNotes.slice(0, 5).map((label) => ({
    label,
    kind: holidaySet.has(label) ? 'holiday' : 'note',
  }))
}

const createWorkTypeId = () =>
  `type-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const createCenterId = () =>
  `center-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const createDispatchSiteId = () =>
  `dispatch-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const createPeriodScheduleId = () =>
  `period-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const createDayNoteId = () =>
  `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const createEmptyProfile = () => ({
  name: '',
  centerId: '',
  dispatchSiteId: CENTER_DISPATCH_SITE_ID,
  profileUpdatedAt: 0,
})

const shouldResetLocalUserStateByQuery = () => {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('resetUser') === '1'
  } catch {
    return false
  }
}

const shouldOpenOnboardingPreviewByQuery = () => {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    const value = params.get(ONBOARDING_PREVIEW_QUERY_KEY)
    if (value === '1' || value === 'true') return true
    return params.get('onboarding') === 'preview'
  } catch {
    return false
  }
}

const shouldUseTutorialDemoDataByQuery = () => {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    const value = (params.get(ONBOARDING_TUTORIAL_DATA_QUERY_KEY) || '').trim().toLowerCase()
    return value === 'demo' || value === '1' || value === 'true'
  } catch {
    return false
  }
}

const hasCompletedOnboardingTutorial = () => {
  if (typeof window === 'undefined') return false
  try {
    if (shouldResetLocalUserStateByQuery()) {
      window.localStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY)
      return false
    }
    return window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) === 'done'
  } catch {
    return false
  }
}

const markOnboardingTutorialCompleted = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'done')
  } catch {
    // localStorage 접근 불가 환경에서는 완료 상태를 저장하지 않습니다.
  }
}

const normalizeIdentityText = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''

const resolveProfileCenterName = (profile, centers = []) => {
  if (typeof profile?.centerName === 'string' && profile.centerName.trim()) {
    return profile.centerName.trim()
  }
  if (!profile?.centerId) return ''
  const center = centers.find((item) => item.id === profile.centerId)
  return center?.name?.trim() || ''
}

const resolveProfileDispatchName = (profile, dispatchSites = []) => {
  if (typeof profile?.dispatchSiteName === 'string' && profile.dispatchSiteName.trim()) {
    return getDispatchLabelText(profile.dispatchSiteName.trim())
  }

  const dispatchSiteId =
    typeof profile?.dispatchSiteId === 'string' && profile.dispatchSiteId
      ? profile.dispatchSiteId
      : CENTER_DISPATCH_SITE_ID

  if (dispatchSiteId === CENTER_DISPATCH_SITE_ID) return '센터'

  const matchedDispatch = dispatchSites.find(
    (site) => site.id === dispatchSiteId && (!profile?.centerId || site.centerId === profile.centerId),
  )
  return matchedDispatch ? getDispatchLabelText(matchedDispatch.name) : ''
}

const getProfileIdentity = (profile, centers = [], _dispatchSites = []) => {
  const name = normalizeIdentityText(profile?.name)
  const centerName = normalizeIdentityText(resolveProfileCenterName(profile, centers))

  if (!name || !centerName) return ''
  return `${centerName}::${name}`
}
const isCenterDispatchSiteId = (dispatchSiteId) =>
  !dispatchSiteId || dispatchSiteId === CENTER_DISPATCH_SITE_ID
const normalizeProfileUpdatedAt = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const confirmAction = (message) => {
  if (typeof window === 'undefined') return true
  try {
    // Android WebView(Capacitor)에서는 confirm 동작이 불안정한 경우가 있어 기본 허용 처리.
    if (window.Capacitor?.isNativePlatform?.()) return true
    return window.confirm(message)
  } catch {
    return true
  }
}

const createSharedUserKey = (profile, centers = [], dispatchSites = []) => {
  const identity = getProfileIdentity(profile, centers, dispatchSites)
  if (identity) return `member:${identity}`
  return ''
}

const findSharedUserKeyByProfile = (userProfiles, profile, centers = [], dispatchSites = []) => {
  const targetIdentity = getProfileIdentity(profile, centers, dispatchSites)
  if (!targetIdentity || !userProfiles || typeof userProfiles !== 'object') return ''

  const candidates = Object.entries(userProfiles).filter(
    ([, user]) => getProfileIdentity(user, centers, dispatchSites) === targetIdentity,
  )
  if (!candidates.length) return ''

  const targetDispatchSiteId = profile?.dispatchSiteId || CENTER_DISPATCH_SITE_ID
  const exactDispatchCandidate = candidates.find(
    ([, user]) => (user?.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === targetDispatchSiteId,
  )
  if (exactDispatchCandidate) return exactDispatchCandidate[0]

  if (!isCenterDispatchSiteId(targetDispatchSiteId)) {
    const nonCenterCandidate = candidates.find(
      ([, user]) => !isCenterDispatchSiteId(user?.dispatchSiteId),
    )
    if (nonCenterCandidate) return nonCenterCandidate[0]
  }

  const rankedCandidates = [...candidates].sort(([leftKey], [rightKey]) => {
    const priorityDiff = getSharedUserKeyPriority(leftKey) - getSharedUserKeyPriority(rightKey)
    if (priorityDiff !== 0) return priorityDiff
    return leftKey.localeCompare(rightKey)
  })
  return rankedCandidates[0]?.[0] || ''

}

const buildTutorialDemoState = () => {
  const demoCurrentDate = new Date(2026, 2, 1)
  const selectedDayStr = '2026-03-17'

  const centers = [
    { id: 'center-mokpo', name: '목포센터' },
    { id: 'center-wando', name: '완도센터' },
  ]

  const dispatchSites = [
    { id: 'dispatch-mokpo-jindo', centerId: 'center-mokpo', name: '진도' },
    { id: 'dispatch-mokpo-namgang', centerId: 'center-mokpo', name: '남강' },
    { id: 'dispatch-wando-gogeum', centerId: 'center-wando', name: '고금' },
  ]

  const workTypes = [
    {
      id: 'type-demo-mokpo-early-a',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '조출A',
      colorIdx: 0,
    },
    {
      id: 'type-demo-mokpo-early-b',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '조출B',
      colorIdx: 3,
    },
    {
      id: 'type-demo-mokpo-early-c',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '조출C',
      colorIdx: 6,
    },
    {
      id: 'type-demo-mokpo-normal',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '정상',
      colorIdx: 1,
    },
    {
      id: 'type-demo-mokpo-extend',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '연장A',
      colorIdx: 7,
    },
    {
      id: 'type-demo-mokpo-off',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '휴무',
      colorIdx: 0,
    },
    {
      id: 'type-demo-mokpo-vacation',
      centerId: 'center-mokpo',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '연가',
      colorIdx: 2,
    },
    {
      id: 'type-demo-mokpo-jindo-a',
      centerId: 'center-mokpo',
      dispatchSiteId: 'dispatch-mokpo-jindo',
      label: '근무A',
      colorIdx: 3,
    },
    {
      id: 'type-demo-mokpo-jindo-b',
      centerId: 'center-mokpo',
      dispatchSiteId: 'dispatch-mokpo-jindo',
      label: '근무B',
      colorIdx: 4,
    },
    {
      id: 'type-demo-wando-early',
      centerId: 'center-wando',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '완도조출',
      colorIdx: 3,
    },
    {
      id: 'type-demo-wando-normal',
      centerId: 'center-wando',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '완도정상',
      colorIdx: 5,
    },
    {
      id: 'type-demo-wando-off',
      centerId: 'center-wando',
      dispatchSiteId: CENTER_DISPATCH_SITE_ID,
      label: '완도휴무',
      colorIdx: 0,
    },
  ]

  const validWorkTypeIdSet = new Set(workTypes.map((type) => type.id))
  const formatMarchDate = (day) => `2026-03-${String(day).padStart(2, '0')}`
  const buildPatternSchedule = (pattern) => {
    const schedule = {}
    for (let day = 1; day <= 31; day += 1) {
      const typeId = pattern[(day - 1) % pattern.length]
      if (!typeId || !validWorkTypeIdSet.has(typeId)) continue
      schedule[formatMarchDate(day)] = typeId
    }
    return schedule
  }

  const mySchedules = buildPatternSchedule([
    'type-demo-mokpo-early-a',
    'type-demo-mokpo-normal',
    'type-demo-mokpo-extend',
    'type-demo-mokpo-off',
    'type-demo-mokpo-off',
    'type-demo-mokpo-vacation',
    'type-demo-mokpo-early-c',
  ])

  const dailyNotes = {
    '2026-03-03': [{ id: 'demo-note-1', text: '09:00 주간회의', centerId: 'center-mokpo' }],
    '2026-03-17': [{ id: 'demo-note-2', text: '지도감독', centerId: 'center-mokpo' }],
    '2026-03-18': [{ id: 'demo-note-3', text: '홍길동, 김철수 지도감독', centerId: 'center-mokpo' }],
    '2026-03-20': [{ id: 'demo-note-4', text: '특별수송 준비', centerId: 'center-mokpo' }],
  }

  const periodSchedules = [
    {
      id: 'demo-period-1',
      label: '특별수송',
      startDate: '2026-03-16',
      endDate: '2026-03-24',
      centerId: 'center-mokpo',
    },
  ]

  const centerNameById = Object.fromEntries(centers.map((center) => [center.id, center.name]))
  const dispatchById = Object.fromEntries(dispatchSites.map((site) => [site.id, site]))
  const toDispatchLabel = (centerId, dispatchSiteId) => {
    if (dispatchSiteId === CENTER_DISPATCH_SITE_ID) return '센터'
    const dispatchSite = dispatchById[dispatchSiteId]
    if (!dispatchSite || dispatchSite.centerId !== centerId) return '센터'
    return getDispatchLabelText(dispatchSite.name)
  }
  const toDemoProfile = (name, centerId, dispatchSiteId = CENTER_DISPATCH_SITE_ID, offset = 0) => ({
    name,
    centerId,
    dispatchSiteId,
    centerName: centerNameById[centerId] || '',
    dispatchSiteName: toDispatchLabel(centerId, dispatchSiteId),
    profileUpdatedAt: Date.now() - offset,
  })

  const profile = toDemoProfile('홍길동', 'center-mokpo', CENTER_DISPATCH_SITE_ID, 0)
  const sharedUserProfiles = {}
  const sharedUserSchedules = {}

  const registerDemoUser = (userProfile, schedules, fallbackSuffix) => {
    const candidateKey = createSharedUserKey(userProfile, centers, dispatchSites)
    const userKey = candidateKey || `member:demo-${fallbackSuffix}`
    sharedUserProfiles[userKey] = userProfile
    sharedUserSchedules[userKey] = schedules
    return userKey
  }

  registerDemoUser(profile, mySchedules, 'me')

  const favoriteUserKeys = [
    registerDemoUser(
      toDemoProfile('김철수', 'center-mokpo', CENTER_DISPATCH_SITE_ID, 1000),
      buildPatternSchedule([
        'type-demo-mokpo-normal',
        'type-demo-mokpo-extend',
        'type-demo-mokpo-off',
        'type-demo-mokpo-off',
        'type-demo-mokpo-vacation',
      ]),
      'jcs',
    ),
    registerDemoUser(
      toDemoProfile('이영희', 'center-mokpo', 'dispatch-mokpo-jindo', 2000),
      buildPatternSchedule([
        'type-demo-mokpo-jindo-a',
        'type-demo-mokpo-jindo-b',
        'type-demo-mokpo-jindo-a',
        'type-demo-mokpo-off',
      ]),
      'cmt',
    ),
    registerDemoUser(
      toDemoProfile('박민수', 'center-mokpo', CENTER_DISPATCH_SITE_ID, 3000),
      buildPatternSchedule([
        'type-demo-mokpo-early-b',
        'type-demo-mokpo-early-a',
        'type-demo-mokpo-normal',
        'type-demo-mokpo-off',
      ]),
      'kjh',
    ),
    registerDemoUser(
      toDemoProfile('최지은', 'center-wando', CENTER_DISPATCH_SITE_ID, 4000),
      buildPatternSchedule([
        'type-demo-wando-early',
        'type-demo-wando-normal',
        'type-demo-wando-off',
      ]),
      'pkh',
    ),
  ]

  registerDemoUser(
    toDemoProfile('한수진', 'center-wando', CENTER_DISPATCH_SITE_ID, 5000),
    buildPatternSchedule([
      'type-demo-wando-normal',
      'type-demo-wando-normal',
      'type-demo-wando-off',
      'type-demo-wando-early',
    ]),
    'sgd',
  )

  return {
    currentDate: demoCurrentDate,
    selectedDayStr,
    profile,
    centers,
    dispatchSites,
    workTypes,
    mySchedules,
    dailyNotes,
    periodSchedules,
    sharedUserProfiles,
    sharedUserSchedules,
    favoriteUserKeys,
    selectedCenterId: 'center-mokpo',
    favoritePickerCenterKey: 'center-mokpo',
  }
}

const getSharedUserKeyPriority = (userKey) => {
  if (userKey.startsWith('member:')) return 0
  if (userKey.startsWith('uid:')) return 1
  return 2
}

const sortDateRange = (startDate, endDate) =>
  startDate <= endDate ? [startDate, endDate] : [endDate, startDate]

const isDateInRange = (dateStr, startDate, endDate) => dateStr >= startDate && dateStr <= endDate
const isYmdDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const cloneDefaultCenters = () => DEFAULT_CENTERS.map((center) => ({ ...center }))
const cloneDefaultDispatchSites = () => DEFAULT_DISPATCH_SITES.map((site) => ({ ...site }))
const cloneDefaultWorkTypes = () => DEFAULT_WORK_TYPES.map((type) => ({ ...type }))
const normalizeWorkType = (type) => {
  const parsedColorIdx = Number(type.colorIdx)
  const colorIdx = Number.isFinite(parsedColorIdx)
    ? Math.max(0, Math.min(COLOR_OPTIONS.length - 1, Math.floor(parsedColorIdx)))
    : 0

  return {
    id: type.id,
    centerId: type.centerId,
    dispatchSiteId: type.dispatchSiteId || CENTER_DISPATCH_SITE_ID,
    label: type.label,
    colorIdx,
  }
}

const areWorkTypesEquivalent = (left, right) => {
  if (!left || !right) return false
  return (
    left.id === right.id &&
    left.centerId === right.centerId &&
    (left.dispatchSiteId || CENTER_DISPATCH_SITE_ID) ===
      (right.dispatchSiteId || CENTER_DISPATCH_SITE_ID) &&
    left.label === right.label &&
    Number(left.colorIdx) === Number(right.colorIdx)
  )
}
const parseLocalYmdDate = (value) => {
  if (!isYmdDateString(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const HOLIDAY_CHINESE_DATE_FORMATTER = (() => {
  try {
    return new Intl.DateTimeFormat('en-u-ca-chinese', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
  } catch {
    return null
  }
})()

const addDaysToDateStr = (dateStr, days) => {
  const parsed = parseLocalYmdDate(dateStr)
  if (!parsed || !Number.isFinite(days)) return ''
  return formatDate(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + Number(days)))
}

const listDateRangeInclusive = (startDate, endDate) => {
  if (!isYmdDateString(startDate) || !isYmdDateString(endDate)) return []
  const [from, to] = sortDateRange(startDate, endDate)
  const dates = []
  let current = from
  let guard = 0

  while (current && current <= to && guard < 400) {
    dates.push(current)
    current = addDaysToDateStr(current, 1)
    guard += 1
  }

  return dates
}

const isWeekendDateStr = (dateStr) => {
  const parsed = parseLocalYmdDate(dateStr)
  if (!parsed) return false
  const day = parsed.getDay()
  return day === 0 || day === 6
}

const parseChineseLunarParts = (date) => {
  if (!HOLIDAY_CHINESE_DATE_FORMATTER) return null
  try {
    const parts = HOLIDAY_CHINESE_DATE_FORMATTER.formatToParts(date)
    const monthText = parts.find((part) => part.type === 'month')?.value || ''
    const dayText = parts.find((part) => part.type === 'day')?.value || ''
    const yearText =
      parts.find((part) => part.type === 'relatedYear')?.value ||
      parts.find((part) => part.type === 'year')?.value ||
      ''

    const lunarMonth = Number(monthText.replace(/[^\d]/g, ''))
    const lunarDay = Number(dayText.replace(/[^\d]/g, ''))
    const lunarYear = Number(yearText.replace(/[^\d-]/g, ''))

    if (!Number.isFinite(lunarMonth) || !Number.isFinite(lunarDay) || !Number.isFinite(lunarYear)) {
      return null
    }

    return {
      lunarMonth,
      lunarDay,
      lunarYear,
      isLeapMonth: monthText.includes('bis'),
    }
  } catch {
    return null
  }
}

const findSolarDateByLunar = (targetLunarYear, targetLunarMonth, targetLunarDay) => {
  if (!HOLIDAY_CHINESE_DATE_FORMATTER) return ''
  if (
    !Number.isFinite(targetLunarYear) ||
    !Number.isFinite(targetLunarMonth) ||
    !Number.isFinite(targetLunarDay)
  ) {
    return ''
  }

  const start = new Date(targetLunarYear, 0, 1)
  const end = new Date(targetLunarYear, 11, 31)
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let guard = 0

  while (cursor <= end && guard < 380) {
    const lunar = parseChineseLunarParts(cursor)
    if (
      lunar &&
      !lunar.isLeapMonth &&
      lunar.lunarYear === targetLunarYear &&
      lunar.lunarMonth === targetLunarMonth &&
      lunar.lunarDay === targetLunarDay
    ) {
      return formatDate(cursor)
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    guard += 1
  }

  return ''
}

const buildAutoHolidaySchedules = (targetYear) => {
  if (!Number.isFinite(targetYear)) return []

  const baseEntries = []
  const addHoliday = ({ label, startDate, endDate, isSubstitutable }) => {
    if (!isYmdDateString(startDate) || !isYmdDateString(endDate)) return
    const [from, to] = sortDateRange(startDate, endDate)
    baseEntries.push({
      label,
      startDate: from,
      endDate: to,
      isSubstitutable: Boolean(isSubstitutable),
      dates: listDateRangeInclusive(from, to),
    })
  }

  const fixedHolidays = [
    { label: '신정', month: 1, day: 1, isSubstitutable: false },
    { label: '삼일절', month: 3, day: 1, isSubstitutable: true },
    { label: '근로자의날', month: 5, day: 1, isSubstitutable: false },
    { label: '어린이날', month: 5, day: 5, isSubstitutable: true },
    { label: '현충일', month: 6, day: 6, isSubstitutable: false },
    { label: '광복절', month: 8, day: 15, isSubstitutable: true },
    { label: '개천절', month: 10, day: 3, isSubstitutable: true },
    { label: '한글날', month: 10, day: 9, isSubstitutable: true },
    { label: '성탄절', month: 12, day: 25, isSubstitutable: true },
  ]

  fixedHolidays.forEach((holiday) => {
    const dateStr = `${targetYear}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`
    addHoliday({
      label: holiday.label,
      startDate: dateStr,
      endDate: dateStr,
      isSubstitutable: holiday.isSubstitutable,
    })
  })

  const seollal = findSolarDateByLunar(targetYear, 1, 1)
  if (seollal) {
    addHoliday({
      label: '설날',
      startDate: addDaysToDateStr(seollal, -1),
      endDate: addDaysToDateStr(seollal, 1),
      isSubstitutable: true,
    })
  }

  const buddhaBirthday = findSolarDateByLunar(targetYear, 4, 8)
  if (buddhaBirthday) {
    addHoliday({
      label: '부처님오신날',
      startDate: buddhaBirthday,
      endDate: buddhaBirthday,
      isSubstitutable: true,
    })
  }

  const chuseok = findSolarDateByLunar(targetYear, 8, 15)
  if (chuseok) {
    addHoliday({
      label: '추석',
      startDate: addDaysToDateStr(chuseok, -1),
      endDate: addDaysToDateStr(chuseok, 1),
      isSubstitutable: true,
    })
  }

  const holidayDateCount = new Map()
  baseEntries.forEach((entry) => {
    entry.dates.forEach((dateStr) => {
      holidayDateCount.set(dateStr, (holidayDateCount.get(dateStr) || 0) + 1)
    })
  })

  const substituteSources = new Map()
  baseEntries.forEach((entry) => {
    if (!entry.isSubstitutable) return
    const needsSubstitute = entry.dates.some(
      (dateStr) => isWeekendDateStr(dateStr) || (holidayDateCount.get(dateStr) || 0) > 1,
    )
    if (!needsSubstitute) return

    const key = entry.dates.join(',')
    const existing = substituteSources.get(key)
    if (existing) {
      existing.labels.push(entry.label)
      if (entry.endDate > existing.afterDate) existing.afterDate = entry.endDate
      return
    }

    substituteSources.set(key, {
      labels: [entry.label],
      afterDate: entry.endDate,
    })
  })

  const occupiedDates = new Set(holidayDateCount.keys())
  const substituteEntries = []

  Array.from(substituteSources.values())
    .sort((left, right) => left.afterDate.localeCompare(right.afterDate))
    .forEach((source, index) => {
      let candidate = addDaysToDateStr(source.afterDate, 1)
      let guard = 0
      while (
        candidate &&
        guard < 30 &&
        (occupiedDates.has(candidate) || isWeekendDateStr(candidate))
      ) {
        candidate = addDaysToDateStr(candidate, 1)
        guard += 1
      }
      if (!candidate) return

      const mergedLabel = Array.from(new Set(source.labels)).join('·')
      substituteEntries.push({
        label: `대체공휴일`,
        startDate: candidate,
        endDate: candidate,
        isSubstituteHoliday: true,
        isAutoHoliday: true,
      })
      occupiedDates.add(candidate)
    })

  const normalizedEntries = [
    ...baseEntries.map((entry) => ({
      label: entry.label,
      startDate: entry.startDate,
      endDate: entry.endDate,
      isSubstituteHoliday: false,
      isAutoHoliday: true,
    })),
    ...substituteEntries,
  ].sort((left, right) => {
    if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate)
    if (left.endDate !== right.endDate) return left.endDate.localeCompare(right.endDate)
    return left.label.localeCompare(right.label, 'ko')
  })

  return normalizedEntries.map((entry, index) => ({
    id: `auto-holiday-${targetYear}-${String(index + 1).padStart(2, '0')}`,
    ...entry,
  }))
}

const readStoredProfile = () => {
  if (typeof window === 'undefined') return createEmptyProfile()

  try {
    if (shouldResetLocalUserStateByQuery()) {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY)
      return createEmptyProfile()
    }

    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return createEmptyProfile()

    const parsed = JSON.parse(raw)
    const parsedCenterId = typeof parsed.centerId === 'string' ? parsed.centerId : ''
    const parsedDispatchSiteId =
      typeof parsed.dispatchSiteId === 'string' && parsed.dispatchSiteId
        ? parsed.dispatchSiteId
        : CENTER_DISPATCH_SITE_ID
    const parsedProfileUpdatedAt = normalizeProfileUpdatedAt(parsed.profileUpdatedAt)
    const legacyAffiliation = typeof parsed.affiliation === 'string' ? parsed.affiliation.trim() : ''

    const migratedCenterId =
      parsedCenterId ||
      DEFAULT_CENTERS.find(
        (center) =>
          center.name === legacyAffiliation ||
          (legacyAffiliation && legacyAffiliation.includes(center.name)),
      )?.id ||
      ''

    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      centerId: migratedCenterId,
      dispatchSiteId: parsedDispatchSiteId,
      profileUpdatedAt: parsedProfileUpdatedAt,
    }
  } catch {
    return createEmptyProfile()
  }
}

const readStoredAppState = () => {
  if (typeof window === 'undefined') return null

  try {
    if (shouldResetLocalUserStateByQuery()) {
      window.localStorage.removeItem(APP_STORAGE_KEY)
      return null
    }

    const raw = window.localStorage.getItem(APP_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)

    const parsedCenters = Array.isArray(parsed.centers)
      ? parsed.centers.filter(
          (center) =>
            center &&
            typeof center.id === 'string' &&
            center.id &&
            typeof center.name === 'string' &&
            center.name,
        )
      : null
    const centers = parsedCenters?.length ? parsedCenters : cloneDefaultCenters()
    const centerIdSet = new Set(centers.map((center) => center.id))

    const parsedDispatchSites = Array.isArray(parsed.dispatchSites)
      ? parsed.dispatchSites.filter(
          (site) =>
            site &&
            typeof site.id === 'string' &&
            site.id &&
            typeof site.centerId === 'string' &&
            centerIdSet.has(site.centerId) &&
            typeof site.name === 'string' &&
            site.name,
        )
      : null
    const dispatchSites = (parsedDispatchSites ?? cloneDefaultDispatchSites()).filter((site) =>
      centerIdSet.has(site.centerId),
    )
    const dispatchSiteIdSet = new Set(dispatchSites.map((site) => site.id))

    const parsedWorkTypes = Array.isArray(parsed.workTypes)
      ? parsed.workTypes
          .filter(
            (type) =>
              type &&
              typeof type.id === 'string' &&
              type.id &&
              typeof type.centerId === 'string' &&
              centerIdSet.has(type.centerId) &&
              typeof type.label === 'string' &&
              type.label,
          )
          .map((type) => {
            const normalized = normalizeWorkType(type)
            if (
              normalized.dispatchSiteId !== CENTER_DISPATCH_SITE_ID &&
              !dispatchSiteIdSet.has(normalized.dispatchSiteId)
            ) {
              return { ...normalized, dispatchSiteId: CENTER_DISPATCH_SITE_ID }
            }
            return normalized
          })
      : null
    const workTypes = (parsedWorkTypes ?? cloneDefaultWorkTypes())
      .filter((type) => centerIdSet.has(type.centerId))
      .map((type) =>
        type.dispatchSiteId !== CENTER_DISPATCH_SITE_ID && !dispatchSiteIdSet.has(type.dispatchSiteId)
          ? { ...type, dispatchSiteId: CENTER_DISPATCH_SITE_ID }
          : type,
      )
    const validTypeIdSet = new Set(workTypes.map((type) => type.id))

    const mySchedules =
      parsed.mySchedules && typeof parsed.mySchedules === 'object' && !Array.isArray(parsed.mySchedules)
        ? Object.entries(parsed.mySchedules).reduce((acc, [dateStr, typeId]) => {
            if (isYmdDateString(dateStr) && typeof typeId === 'string' && validTypeIdSet.has(typeId)) {
              acc[dateStr] = typeId
            }
            return acc
          }, {})
        : {}

    const dailyNotes =
      parsed.dailyNotes && typeof parsed.dailyNotes === 'object' && !Array.isArray(parsed.dailyNotes)
        ? Object.entries(parsed.dailyNotes).reduce((acc, [dateStr, notes]) => {
            if (!isYmdDateString(dateStr) || !Array.isArray(notes)) return acc
            const validNotes = notes.reduce((noteAcc, note, idx) => {
              const normalized = normalizeDailyNoteEntry(note, `legacy-note-${dateStr}-${idx}`)
              if (normalized) noteAcc.push(normalized)
              return noteAcc
            }, [])
            if (validNotes.length) acc[dateStr] = validNotes
            return acc
          }, {})
        : {}

    const periodSchedules = Array.isArray(parsed.periodSchedules)
      ? parsed.periodSchedules
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              item.id &&
              typeof item.label === 'string' &&
              item.label &&
              isYmdDateString(item.startDate) &&
              isYmdDateString(item.endDate),
          )
          .map((item) => {
            const [startDate, endDate] = sortDateRange(item.startDate, item.endDate)
            return {
              id: item.id,
              label: item.label,
              startDate,
              endDate,
              centerId: typeof item.centerId === 'string' ? item.centerId : '',
            }
          })
      : []

    const activeSection =
      parsed.activeSection === FAVORITES_SECTION_ID ? FAVORITES_SECTION_ID : MAIN_SECTION_ID
    const favoriteUserKeys = Array.isArray(parsed.favoriteUserKeys)
      ? parsed.favoriteUserKeys.filter((value) => typeof value === 'string' && value)
      : []

    return {
      centers,
      dispatchSites,
      workTypes,
      mySchedules,
      dailyNotes,
      periodSchedules,
      currentDate: parseLocalYmdDate(parsed.currentDate),
      selectedCenterId: typeof parsed.selectedCenterId === 'string' ? parsed.selectedCenterId : '',
      activeSection,
      favoriteUserKeys,
    }
  } catch {
    return null
  }
}

const normalizeSharedState = (raw) => {
  const parsedCenters = Array.isArray(raw?.centers)
    ? raw.centers.filter(
        (center) =>
          center &&
          typeof center.id === 'string' &&
          center.id &&
          typeof center.name === 'string' &&
          center.name,
      )
    : null
  const centers = parsedCenters?.length ? parsedCenters : cloneDefaultCenters()
  const centerIdSet = new Set(centers.map((center) => center.id))

  const parsedDispatchSites = Array.isArray(raw?.dispatchSites)
    ? raw.dispatchSites.filter(
        (site) =>
          site &&
          typeof site.id === 'string' &&
          site.id &&
          typeof site.centerId === 'string' &&
          centerIdSet.has(site.centerId) &&
          typeof site.name === 'string' &&
          site.name,
      )
    : null
  const dispatchSites = (parsedDispatchSites ?? cloneDefaultDispatchSites()).filter((site) =>
    centerIdSet.has(site.centerId),
  )
  const dispatchSiteIdSet = new Set(dispatchSites.map((site) => site.id))

  const parsedWorkTypes = Array.isArray(raw?.workTypes)
    ? raw.workTypes
        .filter(
          (type) =>
            type &&
            typeof type.id === 'string' &&
            type.id &&
            typeof type.centerId === 'string' &&
            centerIdSet.has(type.centerId) &&
            typeof type.label === 'string' &&
            type.label,
        )
        .map((type) => {
          const normalized = normalizeWorkType(type)
          if (
            normalized.dispatchSiteId !== CENTER_DISPATCH_SITE_ID &&
            !dispatchSiteIdSet.has(normalized.dispatchSiteId)
          ) {
            return { ...normalized, dispatchSiteId: CENTER_DISPATCH_SITE_ID }
          }
          return normalized
        })
    : null
  const workTypes = (parsedWorkTypes ?? cloneDefaultWorkTypes())
    .filter((type) => centerIdSet.has(type.centerId))
    .map((type) =>
      type.dispatchSiteId !== CENTER_DISPATCH_SITE_ID && !dispatchSiteIdSet.has(type.dispatchSiteId)
        ? { ...type, dispatchSiteId: CENTER_DISPATCH_SITE_ID }
        : type,
    )
  const validTypeIdSet = new Set(workTypes.map((type) => type.id))

  const dailyNotes =
    raw?.dailyNotes && typeof raw.dailyNotes === 'object' && !Array.isArray(raw.dailyNotes)
      ? Object.entries(raw.dailyNotes).reduce((acc, [dateStr, notes]) => {
          if (!isYmdDateString(dateStr) || !Array.isArray(notes)) return acc
          const validNotes = notes.reduce((noteAcc, note, idx) => {
            const normalized = normalizeDailyNoteEntry(note, `legacy-note-${dateStr}-${idx}`)
            if (normalized) noteAcc.push(normalized)
            return noteAcc
          }, [])
          if (validNotes.length) acc[dateStr] = validNotes
          return acc
        }, {})
      : {}

  const periodSchedules = Array.isArray(raw?.periodSchedules)
    ? raw.periodSchedules
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            item.id &&
            typeof item.label === 'string' &&
            item.label &&
            isYmdDateString(item.startDate) &&
            isYmdDateString(item.endDate),
        )
        .map((item) => {
          const [startDate, endDate] = sortDateRange(item.startDate, item.endDate)
          return {
            id: item.id,
            label: item.label,
            startDate,
            endDate,
            centerId: typeof item.centerId === 'string' ? item.centerId : '',
          }
        })
    : []

  const parsedUserProfiles =
    raw?.userProfiles && typeof raw.userProfiles === 'object' && !Array.isArray(raw.userProfiles)
      ? Object.entries(raw.userProfiles).reduce((acc, [userKey, user]) => {
          if (!userKey || typeof userKey !== 'string') return acc
          if (!user || typeof user !== 'object') return acc
          const centerId =
            typeof user.centerId === 'string' && centerIdSet.has(user.centerId) ? user.centerId : ''
          const dispatchSiteIdInput =
            typeof user.dispatchSiteId === 'string' && user.dispatchSiteId
              ? user.dispatchSiteId
              : CENTER_DISPATCH_SITE_ID
          const dispatchSiteValid =
            dispatchSiteIdInput === CENTER_DISPATCH_SITE_ID ||
            dispatchSites.some((site) => site.id === dispatchSiteIdInput && site.centerId === centerId)
          const centerNameFromRaw = typeof user.centerName === 'string' ? user.centerName.trim() : ''
          const centerNameFromId = centerId
            ? centers.find((center) => center.id === centerId)?.name?.trim() || ''
            : ''
          const centerName = centerNameFromRaw || centerNameFromId
          const dispatchSiteNameFromRaw =
            typeof user.dispatchSiteName === 'string' ? user.dispatchSiteName.trim() : ''
          const dispatchSiteNameFromId =
            dispatchSiteIdInput === CENTER_DISPATCH_SITE_ID
              ? '센터'
              : dispatchSiteValid
                ? getDispatchLabelText(
                    dispatchSites.find((site) => site.id === dispatchSiteIdInput)?.name || '',
                  )
                : ''
          const dispatchSiteName = dispatchSiteNameFromRaw || dispatchSiteNameFromId
          const profileUpdatedAt = normalizeProfileUpdatedAt(user.profileUpdatedAt)
          acc[userKey] = {
            name: typeof user.name === 'string' ? user.name : '',
            centerId,
            dispatchSiteId: dispatchSiteValid ? dispatchSiteIdInput : CENTER_DISPATCH_SITE_ID,
            centerName,
            dispatchSiteName,
            profileUpdatedAt,
          }
          return acc
        }, {})
      : {}

  const rawToCanonicalUserKey = {}
  const userProfiles = {}
  Object.entries(parsedUserProfiles)
    .sort(([leftKey], [rightKey]) => {
      const priorityDiff = getSharedUserKeyPriority(leftKey) - getSharedUserKeyPriority(rightKey)
      if (priorityDiff !== 0) return priorityDiff
      return leftKey.localeCompare(rightKey)
    })
    .forEach(([rawUserKey, user]) => {
      const identity = getProfileIdentity(user, centers, dispatchSites)
      if (!identity) {
        userProfiles[rawUserKey] = user
        rawToCanonicalUserKey[rawUserKey] = rawUserKey
        return
      }

      const existingCanonicalKey = Object.entries(userProfiles).find(
        ([, existingProfile]) =>
          getProfileIdentity(existingProfile, centers, dispatchSites) === identity,
      )?.[0]

      if (existingCanonicalKey) {
        rawToCanonicalUserKey[rawUserKey] = existingCanonicalKey
        if (shouldReplaceCanonicalProfile(userProfiles[existingCanonicalKey], user)) {
          userProfiles[existingCanonicalKey] = user
        }
        return
      }

      userProfiles[rawUserKey] = user
      rawToCanonicalUserKey[rawUserKey] = rawUserKey
    })

  const parsedUserSchedules =
    raw?.userSchedules && typeof raw.userSchedules === 'object' && !Array.isArray(raw.userSchedules)
      ? Object.entries(raw.userSchedules).reduce((acc, [userKey, schedules]) => {
          if (!userKey || typeof userKey !== 'string') return acc
          if (!schedules || typeof schedules !== 'object' || Array.isArray(schedules)) return acc
          const validSchedules = Object.entries(schedules).reduce((entryAcc, [dateStr, typeId]) => {
            if (isYmdDateString(dateStr) && typeof typeId === 'string' && validTypeIdSet.has(typeId)) {
              entryAcc[dateStr] = typeId
            }
            return entryAcc
          }, {})
          acc[userKey] = validSchedules
          return acc
        }, {})
      : {}

  const userSchedules = {}
  Object.entries(parsedUserSchedules).forEach(([rawUserKey, schedules]) => {
    const canonicalKey = rawToCanonicalUserKey[rawUserKey] || rawUserKey
    const existingSchedules = userSchedules[canonicalKey] || {}
    userSchedules[canonicalKey] = { ...existingSchedules, ...schedules }
  })
  Object.keys(userProfiles).forEach((canonicalKey) => {
    if (!userSchedules[canonicalKey]) userSchedules[canonicalKey] = {}
  })

  return {
    centers,
    dispatchSites,
    workTypes,
    dailyNotes,
    periodSchedules,
    userProfiles,
    userSchedules,
  }
}

const createSharedPayload = ({
  centers,
  dispatchSites,
  workTypes,
  dailyNotes,
  periodSchedules,
  userProfiles,
  userSchedules,
}) => ({
  schemaVersion: 1,
  centers,
  dispatchSites,
  workTypes,
  dailyNotes,
  periodSchedules,
  userProfiles,
  userSchedules,
})
const createSharedPayloadGroups = (payload = {}) => {
  const schemaVersion = Number(payload?.schemaVersion) > 0 ? Number(payload.schemaVersion) : 1
  return {
    core: {
      schemaVersion,
      centers: Array.isArray(payload.centers) ? payload.centers : [],
      dispatchSites: Array.isArray(payload.dispatchSites) ? payload.dispatchSites : [],
      workTypes: Array.isArray(payload.workTypes) ? payload.workTypes : [],
    },
    schedules: {
      schemaVersion,
      dailyNotes:
        payload.dailyNotes && typeof payload.dailyNotes === 'object' && !Array.isArray(payload.dailyNotes)
          ? payload.dailyNotes
          : {},
      periodSchedules: Array.isArray(payload.periodSchedules) ? payload.periodSchedules : [],
    },
    users: {
      schemaVersion,
      userProfiles:
        payload.userProfiles &&
        typeof payload.userProfiles === 'object' &&
        !Array.isArray(payload.userProfiles)
          ? payload.userProfiles
          : {},
      userSchedules:
        payload.userSchedules &&
        typeof payload.userSchedules === 'object' &&
        !Array.isArray(payload.userSchedules)
          ? payload.userSchedules
          : {},
    },
  }
}
const serializeSharedPayloadGroups = (groups) => ({
  core: JSON.stringify(groups?.core ?? {}),
  schedules: JSON.stringify(groups?.schedules ?? {}),
  users: JSON.stringify(groups?.users ?? {}),
})

function shouldReplaceCanonicalProfile(existingProfile, incomingProfile) {
  if (!existingProfile) return true
  const existingUpdatedAt = normalizeProfileUpdatedAt(existingProfile.profileUpdatedAt)
  const incomingUpdatedAt = normalizeProfileUpdatedAt(incomingProfile.profileUpdatedAt)
  if (existingUpdatedAt !== incomingUpdatedAt) return incomingUpdatedAt > existingUpdatedAt
  const existingIsCenter = isCenterDispatchSiteId(existingProfile.dispatchSiteId)
  const incomingIsCenter = isCenterDispatchSiteId(incomingProfile.dispatchSiteId)
  if (existingIsCenter !== incomingIsCenter) return !incomingIsCenter
  return false
}

const canonicalizeSharedUsersForSave = ({
  userProfiles,
  userSchedules,
  centers,
  dispatchSites,
  preferredUserKey = '',
  preferredProfile = null,
  preferredSchedules = null,
}) => {
  const nextProfiles = {}
  const nextSchedules = {}
  const profileEntries = userProfiles && typeof userProfiles === 'object' ? Object.entries(userProfiles) : []
  const orderedEntries = profileEntries.sort(([leftKey], [rightKey]) => {
    const priorityDiff = getSharedUserKeyPriority(leftKey) - getSharedUserKeyPriority(rightKey)
    if (priorityDiff !== 0) return priorityDiff
    return leftKey.localeCompare(rightKey)
  })

  orderedEntries.forEach(([rawUserKey, rawProfile]) => {
    if (!rawUserKey || typeof rawUserKey !== 'string') return
    if (!rawProfile || typeof rawProfile !== 'object') return

    const normalizedProfile = {
      name: typeof rawProfile.name === 'string' ? rawProfile.name : '',
      centerId: typeof rawProfile.centerId === 'string' ? rawProfile.centerId : '',
      dispatchSiteId:
        typeof rawProfile.dispatchSiteId === 'string' && rawProfile.dispatchSiteId
          ? rawProfile.dispatchSiteId
          : CENTER_DISPATCH_SITE_ID,
      centerName: typeof rawProfile.centerName === 'string' ? rawProfile.centerName : '',
      dispatchSiteName:
        typeof rawProfile.dispatchSiteName === 'string' ? rawProfile.dispatchSiteName : '',
      profileUpdatedAt: normalizeProfileUpdatedAt(rawProfile.profileUpdatedAt),
    }

    const identity = getProfileIdentity(normalizedProfile, centers, dispatchSites)
    const canonicalUserKey = identity ? `member:${identity}` : rawUserKey

    if (
      !nextProfiles[canonicalUserKey] ||
      shouldReplaceCanonicalProfile(nextProfiles[canonicalUserKey], normalizedProfile)
    ) {
      nextProfiles[canonicalUserKey] = normalizedProfile
    }

    const rawSchedules =
      userSchedules &&
      typeof userSchedules === 'object' &&
      !Array.isArray(userSchedules) &&
      userSchedules[rawUserKey] &&
      typeof userSchedules[rawUserKey] === 'object' &&
      !Array.isArray(userSchedules[rawUserKey])
        ? userSchedules[rawUserKey]
        : {}

    const existingSchedules = nextSchedules[canonicalUserKey] || {}
    nextSchedules[canonicalUserKey] = { ...existingSchedules, ...rawSchedules }
  })

  if (preferredUserKey && preferredProfile && typeof preferredProfile === 'object') {
    const existingPreferredProfile = nextProfiles[preferredUserKey]
    if (
      !existingPreferredProfile ||
      shouldReplaceCanonicalProfile(existingPreferredProfile, preferredProfile)
    ) {
      nextProfiles[preferredUserKey] = preferredProfile
    }
    const normalizedPreferredSchedules =
      preferredSchedules &&
      typeof preferredSchedules === 'object' &&
      !Array.isArray(preferredSchedules)
        ? preferredSchedules
        : {}
    const existingPreferredSchedules = nextSchedules[preferredUserKey] || {}
    nextSchedules[preferredUserKey] = {
      ...existingPreferredSchedules,
      ...normalizedPreferredSchedules,
    }
  }

  Object.keys(nextProfiles).forEach((userKey) => {
    if (!nextSchedules[userKey]) nextSchedules[userKey] = {}
  })

  return { userProfiles: nextProfiles, userSchedules: nextSchedules }
}

const serializeSharedPayload = (payload) => JSON.stringify(payload)

export default function App() {
  const dayCellRefs = useRef({})
  const mainScrollRef = useRef(null)
  const registrationPopupRef = useRef(null)
  const spotlightCardRef = useRef(null)
  const lastAppliedSpotlightStepIdRef = useRef('')
  const mainScrollHideTimerRef = useRef(null)
  const workTypeReorderTimerRef = useRef(null)
  const workTypeDragLastTargetRef = useRef(null)
  const hasWorkTypeOrderChangedRef = useRef(false)
  const pendingDeletedWorkTypeIdsRef = useRef(new Map())
  const pendingEditedWorkTypesRef = useRef(new Map())
  const lastDeleteActionRef = useRef({ id: '', at: 0 })
  const lastWorkTapRef = useRef({ typeId: '__none__', dayStr: '', at: 0 })
  const pendingAddedWorkTypeIdsRef = useRef(new Map())
  const pendingAddedDispatchSiteIdsRef = useRef(new Map())
  const lastLocalSharedWriteAtRef = useRef(0)
  const lastLocalScheduleWriteAtRef = useRef(0)
  const latestWorkTypesRef = useRef([])
  const latestCentersRef = useRef([])
  const latestDispatchSitesRef = useRef([])
  const latestMySchedulesRef = useRef({})
  const latestDailyNotesRef = useRef({})
  const latestPeriodSchedulesRef = useRef([])
  const lastSharedPayloadRef = useRef('')
  const lastSharedGroupPayloadRef = useRef({ core: '', schedules: '', users: '' })
  const queuedSharedPayloadRef = useRef({
    serialized: '',
    payload: null,
    changedGroups: null,
    groupSerialized: null,
  })
  const isSharedSaveInFlightRef = useRef(false)
  const sharedSyncRetryTimerRef = useRef(null)
  const sharedSaveDebounceTimerRef = useRef(null)
  const hasPendingLocalSharedChangeRef = useRef(false)
  const skipNextSharedSaveRef = useRef(false)
  const lastSharedAuthUidRef = useRef('')
  const lastWidgetPayloadRef = useRef('')
  const hasTriedLocalSharedMigrationRef = useRef(false)
  const hasAppliedTutorialDemoRef = useRef(false)
  const tutorialStateBackupRef = useRef(null)
  const initialAppStateRef = useRef(null)
  if (initialAppStateRef.current === null) {
    initialAppStateRef.current = readStoredAppState()
  }
  const initialAppState = initialAppStateRef.current
  const initialCenters = initialAppState?.centers ?? cloneDefaultCenters()
  const initialSelectedCenterId =
    initialAppState?.selectedCenterId &&
    initialCenters.some((center) => center.id === initialAppState.selectedCenterId)
      ? initialAppState.selectedCenterId
      : initialCenters[0]?.id || ''
  const initialSection =
    initialAppState?.activeSection === FAVORITES_SECTION_ID ? FAVORITES_SECTION_ID : MAIN_SECTION_ID
  const initialFavoriteUserKeys = Array.isArray(initialAppState?.favoriteUserKeys)
    ? Array.from(new Set(initialAppState.favoriteUserKeys.filter((value) => typeof value === 'string' && value)))
    : []
  const initialTodayStr = formatDate(new Date())
  const [profile, setProfile] = useState(readStoredProfile)
  const [currentDate, setCurrentDate] = useState(
    () => initialAppState?.currentDate ?? new Date(2026, 2, 1),
  )

  const [centers, setCenters] = useState(initialCenters)
  const [workTypes, setWorkTypes] = useState(initialAppState?.workTypes ?? cloneDefaultWorkTypes())
  const [dispatchSites, setDispatchSites] = useState(
    initialAppState?.dispatchSites ?? cloneDefaultDispatchSites(),
  )

  const [mySchedules, setMySchedules] = useState(initialAppState?.mySchedules ?? {})
  const [activeSection, setActiveSection] = useState(initialSection)
  const [favoriteUserKeys, setFavoriteUserKeys] = useState(initialFavoriteUserKeys)
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false)
  const [favoritePickerCenterKey, setFavoritePickerCenterKey] = useState('')
  const [selectedDayStr, setSelectedDayStr] = useState(initialTodayStr)
  const [isRegistrationMode, setIsRegistrationMode] = useState(false)
  const [registrationPanel, setRegistrationPanel] = useState('work')
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [registrationPopupHeight, setRegistrationPopupHeight] = useState(REGISTRATION_POPUP_SPACE)
  const [isMainScrolling, setIsMainScrolling] = useState(false)
  const [activeHelpTopicId, setActiveHelpTopicId] = useState('')
  const isOnboardingPreviewMode = shouldOpenOnboardingPreviewByQuery()
  const [isSpotlightTutorialOpen, setIsSpotlightTutorialOpen] = useState(
    () => isOnboardingPreviewMode || !hasCompletedOnboardingTutorial(),
  )
  const isTutorialDemoMode = isSpotlightTutorialOpen
  const [spotlightStepIndex, setSpotlightStepIndex] = useState(0)
  const [spotlightTargetRect, setSpotlightTargetRect] = useState(null)
  const [spotlightSecondaryTargetRect, setSpotlightSecondaryTargetRect] = useState(null)
  const [spotlightCardTop, setSpotlightCardTop] = useState(null)

  const [updateInfo, setUpdateInfo] = useState(null) // { version, downloadUrl }

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [profileNameInput, setProfileNameInput] = useState(profile.name)
  const [profileCenterIdInput, setProfileCenterIdInput] = useState(profile.centerId)
  const [profileDispatchSiteIdInput, setProfileDispatchSiteIdInput] = useState(
    profile.dispatchSiteId || CENTER_DISPATCH_SITE_ID,
  )
  const [profileFormError, setProfileFormError] = useState('')

  const [activeManageModal, setActiveManageModal] = useState(null)
  const [centerManageReturnModal, setCenterManageReturnModal] = useState(null)
  const [selectedCenterId, setSelectedCenterId] = useState(initialSelectedCenterId)
  const [editingTypeId, setEditingTypeId] = useState(null)
  const [pressedOrderTypeId, setPressedOrderTypeId] = useState(null)
  const [draggingOrderTypeId, setDraggingOrderTypeId] = useState(null)
  const [typeCenterIdInput, setTypeCenterIdInput] = useState(initialSelectedCenterId)
  const [typeDispatchSiteIdInput, setTypeDispatchSiteIdInput] = useState(CENTER_DISPATCH_SITE_ID)
  const [typeLabelInput, setTypeLabelInput] = useState('')
  const [typeColorIdxInput, setTypeColorIdxInput] = useState(0)
  const [typeFormError, setTypeFormError] = useState('')
  const [centerNameInput, setCenterNameInput] = useState('')
  const [centerEditInput, setCenterEditInput] = useState('')
  const [centerFormError, setCenterFormError] = useState('')
  const [editingCenterId, setEditingCenterId] = useState(null)
  const [dispatchSiteInput, setDispatchSiteInput] = useState('')
  const [dispatchEditInput, setDispatchEditInput] = useState('')
  const [editingDispatchSiteId, setEditingDispatchSiteId] = useState(null)
  const [dispatchFormError, setDispatchFormError] = useState('')
  const [dailyNotes, setDailyNotes] = useState(initialAppState?.dailyNotes ?? {})
  const [calendarEventsByDate, setCalendarEventsByDate] = useState({})
  const [calendarPermissionGranted, setCalendarPermissionGranted] = useState(false)
  const [dayNoteInput, setDayNoteInput] = useState('')
  const [dayNoteError, setDayNoteError] = useState('')
  const [periodSchedules, setPeriodSchedules] = useState(initialAppState?.periodSchedules ?? [])
  const [periodLabelInput, setPeriodLabelInput] = useState('')
  const [periodStartInput, setPeriodStartInput] = useState('')
  const [periodEndInput, setPeriodEndInput] = useState('')
  const [periodFormError, setPeriodFormError] = useState('')
  const [firebaseUid, setFirebaseUid] = useState('')
  const [firebaseSyncError, setFirebaseSyncError] = useState('')
  const [sharedUserProfiles, setSharedUserProfiles] = useState({})
  const [sharedUserSchedules, setSharedUserSchedules] = useState({})
  const [hasLoadedSharedState, setHasLoadedSharedState] = useState(!isFirebaseConfigured)
  const [sharedSubscriptionRevision, setSharedSubscriptionRevision] = useState(0)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const monthName = currentDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })
  const activeHelpTopic = ONBOARDING_SPOTLIGHT_STEPS.find((step) => step.id === activeHelpTopicId) || null
  const totalSpotlightSteps = ONBOARDING_SPOTLIGHT_STEPS.length
  const safeSpotlightStepIndex = Math.max(0, Math.min(totalSpotlightSteps - 1, spotlightStepIndex))
  const activeSpotlightStep = ONBOARDING_SPOTLIGHT_STEPS[safeSpotlightStepIndex] || null
  const activeSpotlightIcon = activeSpotlightStep?.icon || User
  const SpotlightIcon = activeSpotlightIcon
  const spotlightHoleRects = [spotlightTargetRect, spotlightSecondaryTargetRect].filter(
    (rect) => rect && rect.width > 0 && rect.height > 0,
  )

  const todayStr = formatDate(new Date())
  const autoHolidaySchedules = useMemo(() => buildAutoHolidaySchedules(year), [year])
  const autoHolidayNotesByDate = useMemo(() => {
    const noteMap = {}

    autoHolidaySchedules.forEach((item) => {
      listDateRangeInclusive(item.startDate, item.endDate).forEach((dateStr) => {
        noteMap[dateStr] = mergeUniqueNotes(noteMap[dateStr] ?? [], [item.label])
      })
    })

    return noteMap
  }, [autoHolidaySchedules])
  const userName = profile.name.trim() || '이름 미등록'
  const profileCenter = centers.find((center) => center.id === profile.centerId) || null
  const profileDispatchSite = dispatchSites.find(
    (site) => site.id === profile.dispatchSiteId && site.centerId === profile.centerId,
  )
  const profileDispatchValid =
    profile.dispatchSiteId === CENTER_DISPATCH_SITE_ID || Boolean(profileDispatchSite)
  const profileDispatchLabel =
    profile.dispatchSiteId === CENTER_DISPATCH_SITE_ID
      ? '센터'
      : profileDispatchSite
        ? getDispatchLabelText(profileDispatchSite.name)
        : ''
  const userAffiliation = profileCenter
    ? `${profileCenter.name} / ${profileDispatchLabel || '센터'}`
    : '소속 미등록'
  const isProfileComplete = Boolean(profile.name.trim() && profile.centerId && profileDispatchValid)
  const shouldForceProfileModal =
    !isProfileComplete &&
    (!isSpotlightTutorialOpen || activeSpotlightStep?.id === 'profileRegistration')
  const shouldShowProfileModal = isProfileModalOpen || shouldForceProfileModal
  const matchedUserKey = findSharedUserKeyByProfile(sharedUserProfiles, profile, centers, dispatchSites)
  const canonicalSharedUserKey = createSharedUserKey(profile, centers, dispatchSites)
  const currentSharedUserKey = canonicalSharedUserKey || matchedUserKey
  const firebaseStatusText = isTutorialDemoMode
    ? '튜토리얼 데모 모드'
    : !isFirebaseConfigured
    ? '로컬 모드'
    : firebaseSyncError
      ? firebaseSyncError
      : firebaseUid
        ? hasLoadedSharedState
          ? '서버 정상 작동'
          : '서버 동기화 중...'
        : '공유 모드 연결 중...'
  const otherUsersData = useMemo(() => {
    if (!isFirebaseConfigured && !isTutorialDemoMode) {
      return MOCK_NAMES.map((name, index) => ({
        id: `u-${index}`,
        userName: name,
        centerId: DEFAULT_CENTERS[index % DEFAULT_CENTERS.length].id,
        centerName: DEFAULT_CENTERS[index % DEFAULT_CENTERS.length].name,
        schedules: {
          '2026-03-01': DEFAULT_WORK_TYPES[index % DEFAULT_WORK_TYPES.length].id,
          '2026-03-02': DEFAULT_WORK_TYPES[(index + 2) % DEFAULT_WORK_TYPES.length].id,
        },
      }))
    }

    return Object.entries(sharedUserProfiles)
      .filter(([userKey]) => userKey !== currentSharedUserKey)
      .map(([userKey, user]) => ({
        id: userKey,
        userName: user?.name?.trim() || '이름 미등록',
        centerId: typeof user?.centerId === 'string' ? user.centerId : '',
        centerName:
          (typeof user?.centerName === 'string' && user.centerName.trim()) ||
          (typeof user?.centerId === 'string'
            ? centers.find((center) => center.id === user.centerId)?.name || ''
            : ''),
        schedules:
          sharedUserSchedules[userKey] &&
          typeof sharedUserSchedules[userKey] === 'object' &&
          !Array.isArray(sharedUserSchedules[userKey])
            ? sharedUserSchedules[userKey]
            : {},
      }))
  }, [sharedUserProfiles, sharedUserSchedules, currentSharedUserKey, centers, isTutorialDemoMode])

  const workTypeMap = useMemo(() => new Map(workTypes.map((type) => [type.id, type])), [workTypes])

  const favoriteCandidates = useMemo(
    () =>
      otherUsersData.map((user) => ({
        centerId: typeof user.centerId === 'string' ? user.centerId : '',
        centerName: user.centerName?.trim() || '미지정 센터',
        centerKey:
          (typeof user.centerId === 'string' && user.centerId) ||
          `unknown:${user.centerName?.trim() || '미지정 센터'}`,
        id: user.id,
        userName: user.userName,
        schedules:
          user.schedules && typeof user.schedules === 'object' && !Array.isArray(user.schedules)
            ? user.schedules
            : {},
      })),
    [otherUsersData],
  )

  const favoriteCenterOptions = useMemo(() => {
    const optionMap = new Map()
    favoriteCandidates.forEach((user) => {
      const existing = optionMap.get(user.centerKey)
      if (existing) {
        existing.count += 1
        return
      }
      optionMap.set(user.centerKey, {
        key: user.centerKey,
        label: user.centerName || '미지정 센터',
        count: 1,
        centerId: user.centerId || '',
      })
    })
    return Array.from(optionMap.values())
  }, [favoriteCandidates])

  const favoritePickerUsers = useMemo(() => {
    if (!favoriteCandidates.length) return []
    if (!favoritePickerCenterKey) return favoriteCandidates
    return favoriteCandidates.filter((user) => user.centerKey === favoritePickerCenterKey)
  }, [favoriteCandidates, favoritePickerCenterKey])

  const favoriteColumnUsers = useMemo(() => {
    const selectedSet = new Set(favoriteUserKeys)
    return favoriteCandidates.filter((user) => selectedSet.has(user.id))
  }, [favoriteCandidates, favoriteUserKeys])

  const favoriteTableColumns = useMemo(
    () => [
      {
        id: '__me__',
        userName: `${profile.name.trim() || '나'}(나)`,
        schedules: mySchedules,
        isMe: true,
      },
      ...favoriteColumnUsers.map((user) => ({ ...user, isMe: false })),
    ],
    [profile.name, mySchedules, favoriteColumnUsers],
  )

  const favoriteDateRows = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: daysInMonth }).map((_, index) => {
      const date = new Date(year, month, index + 1)
      const dayOfWeek = date.getDay()
      const dateStr = formatDate(date)
      const dayHolidayNotes = autoHolidayNotesByDate[dateStr] ?? []
      return {
        dateStr,
        dayLabel: String(index + 1),
        weekdayLabel: DAY_LABELS[dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: dayHolidayNotes.length > 0,
      }
    })
  }, [year, month, autoHolidayNotesByDate])

  const workTypesByCenter = useMemo(() => {
    const orderedCenters = [...centers]
    const myCenterIndex = orderedCenters.findIndex((center) => center.id === profile.centerId)
    if (myCenterIndex > 0) {
      const [myCenter] = orderedCenters.splice(myCenterIndex, 1)
      orderedCenters.unshift(myCenter)
    }

    return orderedCenters.map((center) => ({
      ...center,
      types: workTypes.filter((type) => type.centerId === center.id),
    }))
  }, [centers, workTypes, profile.centerId])

  useEffect(() => {
    latestCentersRef.current = centers
  }, [centers])

  useEffect(() => {
    latestDispatchSitesRef.current = dispatchSites
  }, [dispatchSites])

  useEffect(() => {
    latestWorkTypesRef.current = workTypes
  }, [workTypes])
  useEffect(() => {
    latestMySchedulesRef.current = mySchedules
  }, [mySchedules])
  useEffect(() => {
    latestDailyNotesRef.current = dailyNotes
  }, [dailyNotes])
  useEffect(() => {
    latestPeriodSchedulesRef.current = periodSchedules
  }, [periodSchedules])

  useEffect(() => {
    if (isFirebaseConfigured && !hasLoadedSharedState) return
    if (!favoriteCandidates.length) return
    const availableUserIdSet = new Set(favoriteCandidates.map((user) => user.id))
    setFavoriteUserKeys((prev) => {
      const filtered = Array.from(new Set(prev.filter((userId) => availableUserIdSet.has(userId))))
      if (filtered.length === prev.length && filtered.every((userId, index) => userId === prev[index])) {
        return prev
      }
      return filtered
    })
  }, [favoriteCandidates, hasLoadedSharedState])

  useEffect(() => {
    if (!isFavoritePickerOpen) return
    if (!favoriteCenterOptions.length) {
      if (favoritePickerCenterKey) setFavoritePickerCenterKey('')
      return
    }

    if (favoriteCenterOptions.some((option) => option.key === favoritePickerCenterKey)) return

    const preferredOption =
      favoriteCenterOptions.find((option) => option.centerId && option.centerId === profile.centerId) ||
      favoriteCenterOptions[0]

    setFavoritePickerCenterKey(preferredOption?.key || '')
  }, [
    isFavoritePickerOpen,
    favoriteCenterOptions,
    favoritePickerCenterKey,
    profile.centerId,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('resetUser') !== '1') return
      url.searchParams.delete('resetUser')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {
      // Ignore URL parsing failures in unsupported contexts.
    }
  }, [])

  useEffect(() => {
    if (!isTutorialDemoMode) {
      if (hasAppliedTutorialDemoRef.current && tutorialStateBackupRef.current) {
        const backup = tutorialStateBackupRef.current
        setCurrentDate(backup.currentDate)
        setSelectedDayStr(backup.selectedDayStr)
        setProfile(backup.profile)
        setCenters(backup.centers)
        setDispatchSites(backup.dispatchSites)
        setWorkTypes(backup.workTypes)
        setMySchedules(backup.mySchedules)
        setDailyNotes(backup.dailyNotes)
        setPeriodSchedules(backup.periodSchedules)
        setSelectedCenterId(backup.selectedCenterId)
        setTypeCenterIdInput(backup.typeCenterIdInput)
        setTypeDispatchSiteIdInput(backup.typeDispatchSiteIdInput)
        setFavoritePickerCenterKey(backup.favoritePickerCenterKey)
        setFavoriteUserKeys(backup.favoriteUserKeys)
        setSharedUserProfiles(backup.sharedUserProfiles)
        setSharedUserSchedules(backup.sharedUserSchedules)
        setHasLoadedSharedState(backup.hasLoadedSharedState)
        setFirebaseSyncError(backup.firebaseSyncError)
        setFirebaseUid(backup.firebaseUid)
        setActiveSection(backup.activeSection)
        setIsFavoritePickerOpen(backup.isFavoritePickerOpen)
        setIsRegistrationMode(backup.isRegistrationMode)
        setRegistrationPanel(backup.registrationPanel)
        setIsStatusModalOpen(backup.isStatusModalOpen)
        setIsProfileModalOpen(backup.isProfileModalOpen)
        setActiveManageModal(backup.activeManageModal)
        setActiveHelpTopicId(backup.activeHelpTopicId)
        setCenterFormError(backup.centerFormError)
        setDispatchFormError(backup.dispatchFormError)
        setTypeFormError(backup.typeFormError)
        setDayNoteError(backup.dayNoteError)
        setPeriodFormError(backup.periodFormError)
        lastSharedPayloadRef.current = backup.lastSharedPayload
        lastSharedGroupPayloadRef.current = { ...backup.lastSharedGroupPayload }
        queuedSharedPayloadRef.current = { ...backup.queuedSharedPayload }
        tutorialStateBackupRef.current = null
      }
      hasAppliedTutorialDemoRef.current = false
      return
    }
    if (hasAppliedTutorialDemoRef.current) return
    hasAppliedTutorialDemoRef.current = true
    tutorialStateBackupRef.current = {
      currentDate,
      selectedDayStr,
      profile,
      centers,
      dispatchSites,
      workTypes,
      mySchedules,
      dailyNotes,
      periodSchedules,
      selectedCenterId,
      typeCenterIdInput,
      typeDispatchSiteIdInput,
      favoritePickerCenterKey,
      favoriteUserKeys,
      sharedUserProfiles,
      sharedUserSchedules,
      hasLoadedSharedState,
      firebaseSyncError,
      firebaseUid,
      activeSection,
      isFavoritePickerOpen,
      isRegistrationMode,
      registrationPanel,
      isStatusModalOpen,
      isProfileModalOpen,
      activeManageModal,
      activeHelpTopicId,
      centerFormError,
      dispatchFormError,
      typeFormError,
      dayNoteError,
      periodFormError,
      lastSharedPayload: lastSharedPayloadRef.current,
      lastSharedGroupPayload: { ...lastSharedGroupPayloadRef.current },
      queuedSharedPayload: { ...queuedSharedPayloadRef.current },
    }

    const demo = buildTutorialDemoState()
    setCurrentDate(demo.currentDate)
    setSelectedDayStr(demo.selectedDayStr)
    setProfile(demo.profile)
    setCenters(demo.centers)
    setDispatchSites(demo.dispatchSites)
    setWorkTypes(demo.workTypes)
    setMySchedules(demo.mySchedules)
    setDailyNotes(demo.dailyNotes)
    setPeriodSchedules(demo.periodSchedules)
    setSelectedCenterId(demo.selectedCenterId)
    setTypeCenterIdInput(demo.selectedCenterId)
    setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
    setFavoritePickerCenterKey(demo.favoritePickerCenterKey)
    setFavoriteUserKeys(demo.favoriteUserKeys)
    setSharedUserProfiles(demo.sharedUserProfiles)
    setSharedUserSchedules(demo.sharedUserSchedules)
    setHasLoadedSharedState(true)
    setFirebaseSyncError('')
    setFirebaseUid('')
    setActiveSection(MAIN_SECTION_ID)
    setIsFavoritePickerOpen(false)
    setIsRegistrationMode(false)
    setIsStatusModalOpen(false)
    setIsProfileModalOpen(false)
    setActiveManageModal(null)
    setActiveHelpTopicId('')
    setCenterFormError('')
    setDispatchFormError('')
    setTypeFormError('')
    setDayNoteError('')
    setPeriodFormError('')
    lastSharedPayloadRef.current = ''
    lastSharedGroupPayloadRef.current = { core: '', schedules: '', users: '' }
    queuedSharedPayloadRef.current = {
      serialized: '',
      payload: null,
      changedGroups: null,
      groupSerialized: null,
    }
    if (sharedSyncRetryTimerRef.current) {
      window.clearTimeout(sharedSyncRetryTimerRef.current)
      sharedSyncRetryTimerRef.current = null
    }
  }, [isTutorialDemoMode])

  useEffect(() => {
    if (!isOnboardingPreviewMode) return
    setIsSpotlightTutorialOpen(true)
    setSpotlightStepIndex(0)
    setSpotlightTargetRect(null)
    setSpotlightSecondaryTargetRect(null)
    setSpotlightCardTop(null)
    setActiveSection(MAIN_SECTION_ID)
    setIsFavoritePickerOpen(false)
    setIsRegistrationMode(false)
    setIsStatusModalOpen(false)
    setIsProfileModalOpen(false)
    setActiveManageModal(null)
    setActiveHelpTopicId('')
  }, [isOnboardingPreviewMode])

  useEffect(() => {
    if (!isSpotlightTutorialOpen || !activeSpotlightStep) {
      lastAppliedSpotlightStepIdRef.current = ''
      return
    }

    const stepId = activeSpotlightStep.id
    const isStepChanged = lastAppliedSpotlightStepIdRef.current !== stepId
    if (isStepChanged) {
      lastAppliedSpotlightStepIdRef.current = stepId
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' })
      }
    }
    setIsFavoritePickerOpen(false)
    setIsStatusModalOpen(stepId === 'workStatusCheck')
    setActiveHelpTopicId('')
    if (stepId !== 'centerDispatchSettings' && stepId !== 'workTypeManagement') {
      setActiveManageModal(null)
    }

    setIsProfileModalOpen(stepId === 'profileRegistration')

    if (stepId === 'favoritesComparison') {
      setIsRegistrationMode(false)
      setActiveSection(FAVORITES_SECTION_ID)
      return
    }

    setActiveSection(MAIN_SECTION_ID)

    if (stepId === 'profileRegistration') {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' })
      }
      setIsRegistrationMode(false)
      return
    }

    if (stepId === 'scheduleRegistrationMode') {
      if (!(isRegistrationMode && registrationPanel === 'note')) {
        openRegistrationMode('note')
      }
      return
    }

    if (stepId === 'workRegistrationMode') {
      if (!(isRegistrationMode && registrationPanel === 'work')) {
        openRegistrationMode('work')
      }
      return
    }

    if (stepId === 'workTypeManagement') {
      if (!(isRegistrationMode && registrationPanel === 'work')) {
        openRegistrationMode('work')
      }
      if (activeManageModal !== 'workType') {
        setActiveManageModal('workType')
      }
      return
    }

    if (stepId === 'centerDispatchSettings') {
      if (!(isRegistrationMode && registrationPanel === 'work')) {
        openRegistrationMode('work')
      }
      if (activeManageModal !== 'centerManage') {
        openCenterManageModal('workType')
      }
      return
    }

    if (stepId === 'workStatusCheck') {
      const parsedSelectedDay = selectedDayStr ? parseLocalYmdDate(selectedDayStr) : null
      const targetDayStr =
        parsedSelectedDay &&
        parsedSelectedDay.getFullYear() === year &&
        parsedSelectedDay.getMonth() === month
          ? selectedDayStr
          : formatDate(new Date(year, month, 1))
      setSelectedDayStr(targetDayStr)
      setIsRegistrationMode(false)
      setIsStatusModalOpen(true)
      return
    }

    setIsRegistrationMode(false)
  }, [
    isSpotlightTutorialOpen,
    activeSpotlightStep,
    isRegistrationMode,
    registrationPanel,
    activeManageModal,
    selectedDayStr,
    year,
    month,
  ])

  useEffect(() => {
    if (!isSpotlightTutorialOpen || !activeSpotlightStep) {
      setSpotlightTargetRect(null)
      setSpotlightSecondaryTargetRect(null)
      return
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const isSameRect = (left, right) => {
      if (!left && !right) return true
      if (!left || !right) return false
      return (
        left.left === right.left &&
        left.top === right.top &&
        left.width === right.width &&
        left.height === right.height
      )
    }

    const getPaddedRectByTourId = (tourId) => {
      if (!tourId) return null
      const targetElement = document.querySelector(`[data-tour-id="${tourId}"]`)
      if (!targetElement) return null
      const rect = targetElement.getBoundingClientRect()
      const padding = 8
      const left = Math.max(6, rect.left - padding)
      const top = Math.max(6, rect.top - padding)
      const width = Math.min(window.innerWidth - left - 6, rect.width + padding * 2)
      const height = Math.min(window.innerHeight - top - 6, rect.height + padding * 2)
      if (width <= 0 || height <= 0) return null
      return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      }
    }

    const updateRect = () => {
      const nextTargetRect = getPaddedRectByTourId(activeSpotlightStep.targetId)
      const nextSecondaryRect = getPaddedRectByTourId(activeSpotlightStep.secondaryTargetId)
      setSpotlightTargetRect((prev) => (isSameRect(prev, nextTargetRect) ? prev : nextTargetRect))
      setSpotlightSecondaryTargetRect((prev) =>
        isSameRect(prev, nextSecondaryRect) ? prev : nextSecondaryRect,
      )
    }

    let rafId = 0
    let rafQueued = false
    const requestRectUpdate = () => {
      if (rafQueued) return
      rafQueued = true
      rafId = window.requestAnimationFrame(() => {
        rafQueued = false
        updateRect()
      })
    }

    updateRect()
    requestRectUpdate()
    window.addEventListener('resize', requestRectUpdate)
    window.addEventListener('scroll', requestRectUpdate, true)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', requestRectUpdate)
      window.removeEventListener('scroll', requestRectUpdate, true)
    }
  }, [
    isSpotlightTutorialOpen,
    activeSpotlightStep,
    activeSection,
    isRegistrationMode,
    registrationPanel,
    year,
    month,
    selectedDayStr,
  ])

  useEffect(() => {
    if (!isSpotlightTutorialOpen || !activeSpotlightStep) {
      setSpotlightCardTop(null)
      return
    }
    if (typeof window === 'undefined') return

    const updateCardPosition = () => {
      const applyCardTop = (nextTop) => {
        const rounded = nextTop === null ? null : Math.round(nextTop)
        setSpotlightCardTop((prev) => (prev === rounded ? prev : rounded))
      }
      const cardElement = spotlightCardRef.current
      if (!cardElement || !spotlightTargetRect) {
        applyCardTop(null)
        return
      }

      const viewportHeight = window.innerHeight
      const cardHeight = cardElement.getBoundingClientRect().height
      const targetTop = spotlightTargetRect.top
      const targetBottom = spotlightTargetRect.top + spotlightTargetRect.height
      const topSafeGap = SPOTLIGHT_CARD_TOP_SAFE_GAP
      const bottomSafeGap = SPOTLIGHT_CARD_BOTTOM_SAFE_GAP
      const minTop = topSafeGap
      const maxTop = Math.max(minTop, viewportHeight - cardHeight - bottomSafeGap)

      if (
        activeSpotlightStep.id === 'scheduleRegistrationMode' ||
        activeSpotlightStep.id === 'workRegistrationMode' ||
        activeSpotlightStep.id === 'centerDispatchSettings' ||
        activeSpotlightStep.id === 'workTypeManagement'
      ) {
        const monthNavigationElement = document.querySelector('[data-tour-id="tour-month-navigation"]')
        if (!monthNavigationElement) {
          applyCardTop(null)
          return
        }

        const monthNavigationRect = monthNavigationElement.getBoundingClientRect()
        const preferredTop = monthNavigationRect.bottom + SPOTLIGHT_TARGET_GAP
        const nextTop = Math.min(Math.max(minTop, preferredTop), maxTop)
        applyCardTop(nextTop)
        return
      }

      if (activeSpotlightStep.id === 'workStatusCheck') {
        applyCardTop(null)
        return
      }

      const defaultTop = viewportHeight - bottomSafeGap - cardHeight
      const defaultBottom = defaultTop + cardHeight
      const overlapsDefault =
        Math.max(defaultTop, targetTop) < Math.min(defaultBottom, targetBottom)

      if (!overlapsDefault) {
        applyCardTop(null)
        return
      }

      const preferredTopAbove = targetTop - cardHeight - SPOTLIGHT_TARGET_GAP
      const preferredTopBelow = targetBottom + SPOTLIGHT_TARGET_GAP

      let nextTop = null
      if (preferredTopAbove >= minTop) {
        nextTop = preferredTopAbove
      } else if (preferredTopBelow <= maxTop) {
        nextTop = preferredTopBelow
      } else {
        nextTop = Math.min(Math.max(minTop, preferredTopAbove), maxTop)
      }

      applyCardTop(nextTop)
    }

    let rafId = 0
    let rafQueued = false
    const requestCardPositionUpdate = () => {
      if (rafQueued) return
      rafQueued = true
      rafId = window.requestAnimationFrame(() => {
        rafQueued = false
        updateCardPosition()
      })
    }

    updateCardPosition()
    requestCardPositionUpdate()
    window.addEventListener('resize', requestCardPositionUpdate)
    window.addEventListener('scroll', requestCardPositionUpdate, true)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', requestCardPositionUpdate)
      window.removeEventListener('scroll', requestCardPositionUpdate, true)
    }
  }, [
    isSpotlightTutorialOpen,
    activeSpotlightStep,
    spotlightTargetRect,
    safeSpotlightStepIndex,
  ])

  useEffect(() => {
    if (typeof window === 'undefined' || isTutorialDemoMode) return
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  }, [profile, isTutorialDemoMode])

  useEffect(() => {
    if (typeof window === 'undefined' || isTutorialDemoMode) return

    const persisted = {
      currentDate: formatDate(currentDate),
      centers,
      workTypes,
      dispatchSites,
      mySchedules,
      dailyNotes,
      periodSchedules,
      selectedCenterId,
      activeSection,
      favoriteUserKeys,
    }

    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(persisted))
  }, [
    currentDate,
    centers,
    workTypes,
    dispatchSites,
    mySchedules,
    dailyNotes,
    periodSchedules,
    selectedCenterId,
    activeSection,
    favoriteUserKeys,
    isTutorialDemoMode,
  ])

  useEffect(() => {
    if (isTutorialDemoMode) return undefined
    if (!isFirebaseConfigured) return undefined

    const unsubscribe = subscribeAuth((user) => {
      setFirebaseUid(user?.id || '')
    })

    ensureAnonymousAuth().catch(() => {
      setFirebaseSyncError('Supabase 로그인에 실패했습니다. 설정을 확인해 주세요.')
    })

    return () => {
      unsubscribe()
    }
  }, [isTutorialDemoMode])

  useEffect(() => {
    if (isTutorialDemoMode) return
    if (!isFirebaseConfigured || !firebaseUid) return
    ensureSplitSharedState().catch(() => {
      // 마이그레이션 실패는 기존 데이터 사용 흐름을 막지 않는다.
    })
  }, [firebaseUid, isTutorialDemoMode])

  const markLocalSharedChange = useCallback(
    ({ includesSchedule = false } = {}) => {
      const now = Date.now()
      lastLocalSharedWriteAtRef.current = now
      if (includesSchedule) {
        lastLocalScheduleWriteAtRef.current = now
      }
      hasPendingLocalSharedChangeRef.current = true
    },
    [],
  )

  const flushQueuedSharedSave = useCallback(() => {
    if (isTutorialDemoMode) return
    if (!isFirebaseConfigured) return
    if (isSharedSaveInFlightRef.current) return
    if (!hasPendingLocalSharedChangeRef.current) return

    const queued = queuedSharedPayloadRef.current
    if (!queued?.payload || !queued.serialized) return
    if (lastSharedPayloadRef.current === queued.serialized) return

    isSharedSaveInFlightRef.current = true
    const queuedSerialized = queued.serialized
    const queuedPayload = queued.payload
    const queuedChangedGroups =
      queued.changedGroups && typeof queued.changedGroups === 'object'
        ? queued.changedGroups
        : { core: true, schedules: true, users: true }
    const queuedGroupSerialized =
      queued.groupSerialized && typeof queued.groupSerialized === 'object'
        ? queued.groupSerialized
        : null
    lastLocalSharedWriteAtRef.current = Date.now()

    saveSharedState(queuedPayload, { changedGroups: queuedChangedGroups })
      .then(() => {
        if (sharedSyncRetryTimerRef.current) {
          window.clearTimeout(sharedSyncRetryTimerRef.current)
          sharedSyncRetryTimerRef.current = null
        }
        setFirebaseSyncError('')
        lastSharedPayloadRef.current = queuedSerialized
        if (queuedGroupSerialized) {
          lastSharedGroupPayloadRef.current = queuedGroupSerialized
        }
        if (queuedSharedPayloadRef.current.serialized === queuedSerialized) {
          hasPendingLocalSharedChangeRef.current = false
        }
      })
      .catch(() => {
        if (lastSharedPayloadRef.current === queuedSerialized) {
          lastSharedPayloadRef.current = ''
        }
        setFirebaseSyncError('Supabase 저장 중 오류가 발생했습니다. 재시도 중입니다.')

        if (sharedSyncRetryTimerRef.current) {
          window.clearTimeout(sharedSyncRetryTimerRef.current)
        }
        sharedSyncRetryTimerRef.current = window.setTimeout(() => {
          sharedSyncRetryTimerRef.current = null
          flushQueuedSharedSave()
        }, 1200)
      })
      .finally(() => {
        isSharedSaveInFlightRef.current = false
        const latestQueued = queuedSharedPayloadRef.current
        if (
          hasPendingLocalSharedChangeRef.current &&
          latestQueued?.payload &&
          latestQueued.serialized &&
          latestQueued.serialized !== lastSharedPayloadRef.current
        ) {
          flushQueuedSharedSave()
        }
      })
  }, [isTutorialDemoMode])

  const scheduleSharedSaveFlush = useCallback(() => {
    if (isTutorialDemoMode) return
    if (!isFirebaseConfigured) return
    if (typeof window === 'undefined') return

    if (sharedSaveDebounceTimerRef.current) {
      window.clearTimeout(sharedSaveDebounceTimerRef.current)
    }
    sharedSaveDebounceTimerRef.current = window.setTimeout(() => {
      sharedSaveDebounceTimerRef.current = null
      flushQueuedSharedSave()
    }, SHARED_STATE_SAVE_DEBOUNCE_MS)
  }, [flushQueuedSharedSave, isTutorialDemoMode])

  useEffect(
    () => () => {
      if (sharedSyncRetryTimerRef.current) {
        window.clearTimeout(sharedSyncRetryTimerRef.current)
        sharedSyncRetryTimerRef.current = null
      }
      if (sharedSaveDebounceTimerRef.current) {
        window.clearTimeout(sharedSaveDebounceTimerRef.current)
        sharedSaveDebounceTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    if (isTutorialDemoMode) return undefined
    if (!isFirebaseConfigured || !firebaseUid) return undefined
    if (typeof window === 'undefined') return undefined

    const triggerSharedResubscribe = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setSharedSubscriptionRevision((prev) => prev + 1)
      flushQueuedSharedSave()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerSharedResubscribe()
        return
      }
      // 앱이 백그라운드로 전환될 때 pending 저장을 즉시 flush (재설치 등으로 앱 종료 시 데이터 유실 방지)
      flushQueuedSharedSave()
      setSharedSubscriptionRevision((prev) => prev + 1)
    }

    window.addEventListener('focus', triggerSharedResubscribe)
    window.addEventListener('online', triggerSharedResubscribe)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      window.removeEventListener('focus', triggerSharedResubscribe)
      window.removeEventListener('online', triggerSharedResubscribe)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [firebaseUid, flushQueuedSharedSave, isTutorialDemoMode])

  useEffect(() => {
    if (isTutorialDemoMode) return undefined
    if (!isFirebaseConfigured || !firebaseUid) return undefined
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return undefined
    if (lastSharedAuthUidRef.current !== firebaseUid) {
      setHasLoadedSharedState(false)
      lastSharedAuthUidRef.current = firebaseUid
    }

    const unsubscribe = subscribeSharedState(
      (snapshot) => {
        setHasLoadedSharedState(true)
        if (!snapshot.exists()) return

        const rawSharedData = snapshot.data()
        const shared = normalizeSharedState(rawSharedData)
        const isRecentLocalSharedWrite = Date.now() - lastLocalSharedWriteAtRef.current < 1800
        setFirebaseSyncError('')
        skipNextSharedSaveRef.current = true

        setCenters(shared.centers)
        setDispatchSites((prevLocalDispatchSites) => {
          const now = Date.now()
          const pendingDispatchAdds = pendingAddedDispatchSiteIdsRef.current
          if (!pendingDispatchAdds.size) return shared.dispatchSites

          const remoteDispatchIdSet = new Set(shared.dispatchSites.map((site) => site.id))
          let nextDispatchSites = shared.dispatchSites
          let hasMergedPendingDispatch = false

          Array.from(pendingDispatchAdds.entries()).forEach(([pendingSiteId, meta]) => {
            const expiresAt = typeof meta?.expiresAt === 'number' ? meta.expiresAt : 0
            if (expiresAt <= now) {
              pendingDispatchAdds.delete(pendingSiteId)
              return
            }

            if (remoteDispatchIdSet.has(pendingSiteId)) {
              pendingDispatchAdds.delete(pendingSiteId)
              return
            }

            const localPendingSite = prevLocalDispatchSites.find((site) => site.id === pendingSiteId)
            if (!localPendingSite) {
              pendingDispatchAdds.delete(pendingSiteId)
              return
            }

            if (!hasMergedPendingDispatch) {
              nextDispatchSites = [...shared.dispatchSites]
              hasMergedPendingDispatch = true
            }
            nextDispatchSites.push(localPendingSite)
          })

          return nextDispatchSites
        })
        setWorkTypes((prevLocalWorkTypes) => {
          const now = Date.now()
          const pendingAdds = pendingAddedWorkTypeIdsRef.current
          const pendingDeletes = pendingDeletedWorkTypeIdsRef.current
          const pendingEdits = pendingEditedWorkTypesRef.current
          const remoteTypeIdSet = new Set(shared.workTypes.map((type) => type.id))
          const activePendingDeleteIdSet = new Set()

          Array.from(pendingDeletes.entries()).forEach(([pendingTypeId, meta]) => {
            if (!meta || typeof meta !== 'object') {
              pendingDeletes.delete(pendingTypeId)
              return
            }

            const expiresAt = typeof meta.expiresAt === 'number' ? meta.expiresAt : 0
            if (expiresAt <= now) {
              pendingDeletes.delete(pendingTypeId)
              return
            }

            activePendingDeleteIdSet.add(pendingTypeId)
          })

          Array.from(pendingEdits.entries()).forEach(([pendingTypeId, meta]) => {
            if (!meta || typeof meta !== 'object') {
              pendingEdits.delete(pendingTypeId)
              return
            }

            const expiresAt = typeof meta.expiresAt === 'number' ? meta.expiresAt : 0
            if (expiresAt <= now) {
              pendingEdits.delete(pendingTypeId)
            }
          })

          let nextWorkTypes = activePendingDeleteIdSet.size
            ? shared.workTypes.filter((type) => !activePendingDeleteIdSet.has(type.id))
            : shared.workTypes

          if (!pendingAdds.size) return nextWorkTypes

          const mergedTypeIdSet = new Set(nextWorkTypes.map((type) => type.id))
          let hasMergedPendingType = false

          Array.from(pendingAdds.entries()).forEach(([pendingTypeId, meta]) => {
            const expiresAt = typeof meta?.expiresAt === 'number' ? meta.expiresAt : 0
            if (expiresAt <= now) {
              pendingAdds.delete(pendingTypeId)
              return
            }

            if (activePendingDeleteIdSet.has(pendingTypeId)) {
              pendingAdds.delete(pendingTypeId)
              return
            }

            if (mergedTypeIdSet.has(pendingTypeId)) {
              pendingAdds.delete(pendingTypeId)
              return
            }

            const localPendingType = prevLocalWorkTypes.find((type) => type.id === pendingTypeId)
            if (!localPendingType) {
              pendingAdds.delete(pendingTypeId)
              return
            }

            if (!hasMergedPendingType) {
              nextWorkTypes = [...nextWorkTypes]
              hasMergedPendingType = true
            }
            nextWorkTypes.push(localPendingType)
            mergedTypeIdSet.add(pendingTypeId)
          })

          if (pendingEdits.size) {
            let hasAppliedPendingEdit = false
            const nextById = new Map(nextWorkTypes.map((type) => [type.id, type]))

            Array.from(pendingEdits.entries()).forEach(([pendingTypeId, meta]) => {
              if (!meta || typeof meta !== 'object') {
                pendingEdits.delete(pendingTypeId)
                return
              }

              const localEditedType = normalizeWorkType(meta.type || {})
              if (!localEditedType?.id || localEditedType.id !== pendingTypeId) {
                pendingEdits.delete(pendingTypeId)
                return
              }

              const remoteType = nextById.get(pendingTypeId)
              if (!remoteType) {
                pendingEdits.delete(pendingTypeId)
                return
              }

              if (areWorkTypesEquivalent(remoteType, localEditedType)) {
                pendingEdits.delete(pendingTypeId)
                return
              }

              if (!hasAppliedPendingEdit) {
                nextWorkTypes = [...nextWorkTypes]
                hasAppliedPendingEdit = true
              }

              const replaceIndex = nextWorkTypes.findIndex((type) => type.id === pendingTypeId)
              if (replaceIndex >= 0) {
                nextWorkTypes[replaceIndex] = localEditedType
              }
            })
          }

          return nextWorkTypes
        })
        setDailyNotes((prevLocalDailyNotes) => {
          if (!isRecentLocalSharedWrite) return shared.dailyNotes
          const localJson = JSON.stringify(prevLocalDailyNotes || {})
          const remoteJson = JSON.stringify(shared.dailyNotes || {})
          return localJson === remoteJson ? shared.dailyNotes : prevLocalDailyNotes
        })
        setPeriodSchedules((prevLocalPeriodSchedules) => {
          if (!isRecentLocalSharedWrite) return shared.periodSchedules
          const localJson = JSON.stringify(prevLocalPeriodSchedules || [])
          const remoteJson = JSON.stringify(shared.periodSchedules || [])
          return localJson === remoteJson ? shared.periodSchedules : prevLocalPeriodSchedules
        })
        setSharedUserProfiles(shared.userProfiles)
        setSharedUserSchedules(shared.userSchedules)
        const knownCenterIdSet = new Set([
          ...shared.centers.map((center) => center.id),
          ...latestCentersRef.current.map((center) => center.id),
        ])
        const fallbackCenterId = shared.centers[0]?.id || latestCentersRef.current[0]?.id || ''
        setSelectedCenterId((prev) =>
          knownCenterIdSet.has(prev) ? prev : fallbackCenterId,
        )
        setTypeCenterIdInput((prev) =>
          knownCenterIdSet.has(prev) ? prev : fallbackCenterId,
        )
        const knownDispatchIdSet = new Set([
          ...shared.dispatchSites.map((site) => site.id),
          ...latestDispatchSitesRef.current.map((site) => site.id),
          ...Array.from(pendingAddedDispatchSiteIdsRef.current.keys()),
        ])
        setTypeDispatchSiteIdInput((prev) =>
          prev === CENTER_DISPATCH_SITE_ID || knownDispatchIdSet.has(prev)
            ? prev
            : CENTER_DISPATCH_SITE_ID,
        )

        const snapshotCanonicalUserKey = createSharedUserKey(profile, shared.centers, shared.dispatchSites)
        const snapshotMatchedUserKey =
          (snapshotCanonicalUserKey && shared.userProfiles[snapshotCanonicalUserKey]
            ? snapshotCanonicalUserKey
            : '') ||
          findSharedUserKeyByProfile(shared.userProfiles, profile, shared.centers, shared.dispatchSites)
        if (snapshotMatchedUserKey) {
          const remoteProfile = shared.userProfiles[snapshotMatchedUserKey]
          const remoteMySchedules = shared.userSchedules[snapshotMatchedUserKey]

          if (remoteProfile) {
            setProfile((prevProfile) =>
              shouldReplaceCanonicalProfile(prevProfile, remoteProfile) ? remoteProfile : prevProfile,
            )
          }

          const isRecentLocalWrite = Date.now() - lastLocalScheduleWriteAtRef.current < 1800
          const remoteSchedulesNormalized =
            remoteMySchedules &&
            typeof remoteMySchedules === 'object' &&
            !Array.isArray(remoteMySchedules)
              ? remoteMySchedules
              : {}

          if (isRecentLocalWrite) {
            const localJson = JSON.stringify(latestMySchedulesRef.current || {})
            const remoteJson = JSON.stringify(remoteSchedulesNormalized)
            if (localJson === remoteJson) {
              setMySchedules(remoteSchedulesNormalized)
            }
          } else {
            setMySchedules(remoteSchedulesNormalized)
          }
        }

        lastSharedPayloadRef.current = serializeSharedPayload(
          createSharedPayload({
            centers: shared.centers,
            dispatchSites: shared.dispatchSites,
            workTypes: shared.workTypes,
            dailyNotes: shared.dailyNotes,
            periodSchedules: shared.periodSchedules,
            userProfiles: shared.userProfiles,
            userSchedules: shared.userSchedules,
          }),
        )
        lastSharedGroupPayloadRef.current = serializeSharedPayloadGroups(
          createSharedPayloadGroups({
            schemaVersion: 1,
            centers: shared.centers,
            dispatchSites: shared.dispatchSites,
            workTypes: shared.workTypes,
            dailyNotes: shared.dailyNotes,
            periodSchedules: shared.periodSchedules,
            userProfiles: shared.userProfiles,
            userSchedules: shared.userSchedules,
          }),
        )
      },
      () => {
        setHasLoadedSharedState(true)
        setFirebaseSyncError('Supabase 데이터 동기화 중 오류가 발생했습니다.')
      },
    )

    return () => {
      unsubscribe()
    }
  }, [firebaseUid, profile, isProfileComplete, sharedSubscriptionRevision, isTutorialDemoMode])

  useEffect(() => {
    if (isTutorialDemoMode) return
    if (!isFirebaseConfigured || !firebaseUid) return
    if (!hasLoadedSharedState) return
    if (skipNextSharedSaveRef.current && !hasPendingLocalSharedChangeRef.current) {
      skipNextSharedSaveRef.current = false
      return
    }
    skipNextSharedSaveRef.current = false
    if (!hasPendingLocalSharedChangeRef.current) return
    const mergedUserProfiles = { ...sharedUserProfiles }
    const mergedUserSchedules = { ...sharedUserSchedules }
    const preferredProfile =
      isProfileComplete && currentSharedUserKey
        ? {
        name: profile.name,
        centerId: profile.centerId,
        dispatchSiteId: profile.dispatchSiteId || CENTER_DISPATCH_SITE_ID,
        centerName: profileCenter?.name || '',
        dispatchSiteName: profileDispatchLabel || '센터',
        profileUpdatedAt: normalizeProfileUpdatedAt(profile.profileUpdatedAt),
      }
        : null
    const preferredUserKey = isProfileComplete ? createSharedUserKey(profile, centers, dispatchSites) : ''
    const { userProfiles: nextUserProfiles, userSchedules: nextUserSchedules } =
      canonicalizeSharedUsersForSave({
        userProfiles: mergedUserProfiles,
        userSchedules: mergedUserSchedules,
        centers,
        dispatchSites,
        preferredUserKey,
        preferredProfile,
        preferredSchedules: isProfileComplete ? mySchedules : null,
      })

    const payload = createSharedPayload({
      centers,
      dispatchSites,
      workTypes,
      dailyNotes,
      periodSchedules,
      userProfiles: nextUserProfiles,
      userSchedules: nextUserSchedules,
    })
    const nextPayloadGroups = createSharedPayloadGroups(payload)
    const nextGroupSerialized = serializeSharedPayloadGroups(nextPayloadGroups)
    const changedGroups = {
      core: nextGroupSerialized.core !== lastSharedGroupPayloadRef.current.core,
      schedules: nextGroupSerialized.schedules !== lastSharedGroupPayloadRef.current.schedules,
      users: nextGroupSerialized.users !== lastSharedGroupPayloadRef.current.users,
    }
    if (!changedGroups.core && !changedGroups.schedules && !changedGroups.users) {
      hasPendingLocalSharedChangeRef.current = false
      return
    }

    const serializedPayload = serializeSharedPayload(payload)
    if (lastSharedPayloadRef.current === serializedPayload) {
      hasPendingLocalSharedChangeRef.current = false
      lastSharedGroupPayloadRef.current = nextGroupSerialized
      return
    }

    queuedSharedPayloadRef.current = {
      serialized: serializedPayload,
      payload,
      changedGroups,
      groupSerialized: nextGroupSerialized,
    }
    scheduleSharedSaveFlush()
  }, [
    firebaseUid,
    hasLoadedSharedState,
    currentSharedUserKey,
    centers,
    dispatchSites,
    workTypes,
    dailyNotes,
    periodSchedules,
    profile,
    profileCenter,
    profileDispatchLabel,
    isProfileComplete,
    mySchedules,
    sharedUserProfiles,
    sharedUserSchedules,
    scheduleSharedSaveFlush,
    isTutorialDemoMode,
  ])

  const activeScheduleCenterId = profile.centerId || ''
  const centerDailyNotes = useMemo(
    () => buildCenterScopedDailyNotesMap(dailyNotes, activeScheduleCenterId),
    [dailyNotes, activeScheduleCenterId],
  )
  const centerPeriodSchedules = useMemo(
    () =>
      activeScheduleCenterId
        ? periodSchedules.filter((item) => getPeriodCenterId(item) === activeScheduleCenterId)
        : [],
    [periodSchedules, activeScheduleCenterId],
  )

  useEffect(() => {
    if (isTutorialDemoMode) return
    if (!isFirebaseConfigured || !firebaseUid || !hasLoadedSharedState) return
    if (hasTriedLocalSharedMigrationRef.current) return
    hasTriedLocalSharedMigrationRef.current = true

    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(LOCAL_TO_SHARED_MIGRATION_KEY) === 'done') return

    const localState = initialAppStateRef.current
    if (!localState) {
      window.localStorage.setItem(LOCAL_TO_SHARED_MIGRATION_KEY, 'done')
      return
    }

    const localCenters = Array.isArray(localState.centers) ? localState.centers : []
    const localDispatchSites = Array.isArray(localState.dispatchSites) ? localState.dispatchSites : []
    const localWorkTypes = Array.isArray(localState.workTypes) ? localState.workTypes : []
    const localMySchedules =
      localState.mySchedules &&
      typeof localState.mySchedules === 'object' &&
      !Array.isArray(localState.mySchedules)
        ? localState.mySchedules
        : {}
    const localDailyNotes =
      localState.dailyNotes &&
      typeof localState.dailyNotes === 'object' &&
      !Array.isArray(localState.dailyNotes)
        ? localState.dailyNotes
        : {}
    const localPeriodSchedules = Array.isArray(localState.periodSchedules)
      ? localState.periodSchedules
      : []

    const hasLocalContent =
      localCenters.length > 0 ||
      localDispatchSites.length > 0 ||
      localWorkTypes.length > 0 ||
      Object.keys(localMySchedules).length > 0 ||
      Object.keys(localDailyNotes).length > 0 ||
      localPeriodSchedules.length > 0

    if (!hasLocalContent) {
      window.localStorage.setItem(LOCAL_TO_SHARED_MIGRATION_KEY, 'done')
      return
    }

    const isNotDemo = (item) => !item?.id?.includes('demo')
    const mergedCenters = mergeEntitiesById(centers, localCenters.filter(isNotDemo))
    const mergedDispatchSites = mergeEntitiesById(dispatchSites, localDispatchSites.filter(isNotDemo))
    const mergedWorkTypes = mergeEntitiesById(workTypes, localWorkTypes.filter(isNotDemo))
    const mergedDailyNotes = mergeDailyNotesForMigration(dailyNotes, localDailyNotes)
    const mergedPeriodSchedules = mergePeriodSchedulesForMigration(periodSchedules, localPeriodSchedules)
    const mergedMySchedules = { ...mySchedules, ...localMySchedules }

    const beforeJson = JSON.stringify({
      centers,
      dispatchSites,
      workTypes,
      dailyNotes,
      periodSchedules,
      mySchedules,
    })
    const afterJson = JSON.stringify({
      centers: mergedCenters,
      dispatchSites: mergedDispatchSites,
      workTypes: mergedWorkTypes,
      dailyNotes: mergedDailyNotes,
      periodSchedules: mergedPeriodSchedules,
      mySchedules: mergedMySchedules,
    })

    window.localStorage.setItem(LOCAL_TO_SHARED_MIGRATION_KEY, 'done')
    if (beforeJson === afterJson) return

    markLocalSharedChange({ includesSchedule: true })
    setCenters(mergedCenters)
    setDispatchSites(mergedDispatchSites)
    setWorkTypes(mergedWorkTypes)
    setDailyNotes(mergedDailyNotes)
    setPeriodSchedules(mergedPeriodSchedules)
    setMySchedules(mergedMySchedules)
  }, [
    isFirebaseConfigured,
    firebaseUid,
    hasLoadedSharedState,
    centers,
    dispatchSites,
    workTypes,
    dailyNotes,
    periodSchedules,
    mySchedules,
    markLocalSharedChange,
    isTutorialDemoMode,
  ])

  useEffect(() => {
    setDayNoteInput('')
    setDayNoteError('')
    const baseDate = selectedDayStr || todayStr
    setPeriodStartInput(baseDate)
    setPeriodEndInput(baseDate)
    setPeriodLabelInput('')
    setPeriodFormError('')
  }, [selectedDayStr, todayStr])

  useEffect(() => {
    console.log('[UPDATE] 체크 시작, 현재 버전:', APP_VERSION)
    fetch('https://api.github.com/repos/dla6154-dev/work-schedule/releases/latest')
      .then((r) => r.json())
      .then((data) => {
        console.log('[UPDATE] 응답:', data?.tag_name)
        if (!data?.tag_name) return
        const latest = parseInt(data.tag_name.replace(/[^0-9]/g, ''), 10)
        console.log('[UPDATE] 최신:', latest, '현재:', APP_VERSION, '업데이트필요:', latest > APP_VERSION)
        if (latest > APP_VERSION) {
          const asset = data.assets?.find((a) => a.name.endsWith('.apk'))
          const downloadUrl = asset?.browser_download_url || data.html_url
          console.log('[UPDATE] downloadUrl:', downloadUrl)
          setUpdateInfo({ version: latest, downloadUrl })
        }
      })
      .catch((e) => console.log('[UPDATE] 오류:', e.message))
  }, [])

  useEffect(() => {
    if (isTutorialDemoMode) return
    const workTypeMap = new Map(workTypes.map((type) => [type.id, type]))
    const monthLabel = `${year}년 ${month + 1}월`
    const monthCellsJson = JSON.stringify(
      buildWidgetMonthCells({
        year,
        month,
        mySchedules,
        workTypeMap,
        dailyNotes: centerDailyNotes,
        periodSchedules: centerPeriodSchedules,
        holidayNotesByDate: autoHolidayNotesByDate,
        calendarEventsByDate,
        todayStr,
      }),
    )
    const prevDate = new Date(year, month - 1, 1)
    const prevYear = prevDate.getFullYear()
    const prevMonth = prevDate.getMonth()
    const prevMonthLabel = `${prevYear}년 ${prevMonth + 1}월`
    const prevMonthCellsJson = JSON.stringify(
      buildWidgetMonthCells({
        year: prevYear,
        month: prevMonth,
        mySchedules,
        workTypeMap,
        dailyNotes: centerDailyNotes,
        periodSchedules: centerPeriodSchedules,
        holidayNotesByDate: autoHolidayNotesByDate,
        calendarEventsByDate,
        todayStr,
      }),
    )
    const nextDate = new Date(year, month + 1, 1)
    const nextYear = nextDate.getFullYear()
    const nextMonth = nextDate.getMonth()
    const nextMonthLabel = `${nextYear}년 ${nextMonth + 1}월`
    const nextMonthCellsJson = JSON.stringify(
      buildWidgetMonthCells({
        year: nextYear,
        month: nextMonth,
        mySchedules,
        workTypeMap,
        dailyNotes: centerDailyNotes,
        periodSchedules: centerPeriodSchedules,
        holidayNotesByDate: autoHolidayNotesByDate,
        calendarEventsByDate,
        todayStr,
      }),
    )
    const todayNotesJson = JSON.stringify(
      buildWidgetTodayNotes({
        todayStr,
        dailyNotes: centerDailyNotes,
        periodSchedules: centerPeriodSchedules,
        holidayNotesByDate: autoHolidayNotesByDate,
      }),
    )
    const widgetPayload = {
      monthLabel,
      monthCellsJson,
      prevMonthLabel,
      prevMonthCellsJson,
      nextMonthLabel,
      nextMonthCellsJson,
      todayDateLabel: (() => {
        if (!isYmdDateString(todayStr)) return todayStr
        const [, m, d] = todayStr.split('-')
        return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
      })(),
      todayNotesJson,
    }
    const serializedWidgetPayload = JSON.stringify(widgetPayload)
    if (lastWidgetPayloadRef.current === serializedWidgetPayload) return
    lastWidgetPayloadRef.current = serializedWidgetPayload

    syncWidgetSnapshot(widgetPayload)
  }, [
    mySchedules,
    workTypes,
    centerDailyNotes,
    centerPeriodSchedules,
    autoHolidayNotesByDate,
    calendarEventsByDate,
    year,
    month,
    todayStr,
    isTutorialDemoMode,
  ])

  // 캘린더 이벤트 fetch 함수 (ref로 관리해 visibilitychange에서도 호출 가능)
  const fetchCalendarEventsRef = useRef(null)
  const calSwipeTouchStartXRef = useRef(null)
  const calSwipeTouchStartYRef = useRef(null)
  const calendarCaptureRef = useRef(null)

  const [isCapturing, setIsCapturing] = useState(false)

  const handleCalendarCapture = async () => {
    if (!calendarCaptureRef.current || isCapturing) return
    setIsCapturing(true)
    try {
      const el = calendarCaptureRef.current
      // overflow:hidden 요소 임시 해제 (텍스트 잘림 방지)
      const overflowEls = el.querySelectorAll('*')
      const origOverflows = []
      overflowEls.forEach((node) => {
        const s = window.getComputedStyle(node)
        if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') {
          origOverflows.push({ node, overflow: node.style.overflow, overflowX: node.style.overflowX, overflowY: node.style.overflowY })
          node.style.overflow = 'visible'
          node.style.overflowX = 'visible'
          node.style.overflowY = 'visible'
        }
      })
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
        allowTaint: true,
        foreignObjectRendering: false,
      })
      // overflow 원복
      origOverflows.forEach(({ node, overflow, overflowX, overflowY }) => {
        node.style.overflow = overflow
        node.style.overflowX = overflowX
        node.style.overflowY = overflowY
      })
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const fileName = `근무편성_${monthName.replace(/\s/g, '')}.png`
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      })
      await Share.share({
        title: `${monthName} 근무편성`,
        files: [savedFile.uri],
        dialogTitle: '근무편성 공유',
      })
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {})
    } catch (e) {
      // 취소 또는 오류 무시
    } finally {
      setIsCapturing(false)
    }
  }
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0')
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    const fetchCalendarEvents = async () => {
      // 권한 확인 (최초 1회만 요청, 이후는 확인만)
      let granted = calendarPermissionGranted
      if (!granted) {
        granted = await checkCalendarPermission()
        if (!granted) granted = await requestCalendarPermission()
        setCalendarPermissionGranted(granted)
      }
      if (!granted) return

      const startDate = fmt(new Date(year, month - 1, 1))
      const endDate = fmt(new Date(year, month + 2, 1))
      const events = await getCalendarEventsRange(startDate, endDate)
      setCalendarEventsByDate(events)
    }

    fetchCalendarEventsRef.current = fetchCalendarEvents
    fetchCalendarEvents()
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  // 앱이 포그라운드로 돌아올 때 캘린더 재fetch
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && fetchCalendarEventsRef.current) {
        fetchCalendarEventsRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const hasValidDispatch =
      profileDispatchSiteIdInput === CENTER_DISPATCH_SITE_ID ||
      dispatchSites.some(
        (site) => site.id === profileDispatchSiteIdInput && site.centerId === profileCenterIdInput,
      )

    if (!hasValidDispatch) {
      setProfileDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
    }
  }, [dispatchSites, profileCenterIdInput, profileDispatchSiteIdInput])

  const resetProfileForm = () => {
    const fallbackCenterId = profile.centerId || centers[0]?.id || ''
    setProfileNameInput(profile.name)
    setProfileCenterIdInput(fallbackCenterId)
    setProfileDispatchSiteIdInput(profile.dispatchSiteId || CENTER_DISPATCH_SITE_ID)
    setProfileFormError('')
  }

  const openProfileModal = () => {
    setIsStatusModalOpen(false)
    setActiveManageModal(null)
    resetProfileForm()
    setIsProfileModalOpen(true)
  }

  const saveProfile = () => {
    const nextName = profileNameInput.trim()
    const nextCenterId = profileCenterIdInput
    const nextDispatchSiteId = profileDispatchSiteIdInput || CENTER_DISPATCH_SITE_ID
    const dispatchValid =
      nextDispatchSiteId === CENTER_DISPATCH_SITE_ID ||
      dispatchSites.some((site) => site.id === nextDispatchSiteId && site.centerId === nextCenterId)

    if (!nextName || !nextCenterId || !dispatchValid) {
      setProfileFormError('이름, 센터, 근무지를 모두 입력해 주세요.')
      return
    }

    markLocalSharedChange({ includesSchedule: true })
    const nextProfile = {
      name: nextName,
      centerId: nextCenterId,
      dispatchSiteId: nextDispatchSiteId,
      profileUpdatedAt: Date.now(),
    }
    const existingUserKey = findSharedUserKeyByProfile(
      sharedUserProfiles,
      nextProfile,
      centers,
      dispatchSites,
    )

    if (existingUserKey) {
      const existingSchedules =
        sharedUserSchedules[existingUserKey] &&
        typeof sharedUserSchedules[existingUserKey] === 'object' &&
        !Array.isArray(sharedUserSchedules[existingUserKey])
          ? sharedUserSchedules[existingUserKey]
          : {}
      setMySchedules(existingSchedules)
    } else {
      setMySchedules({})
    }

    setProfile(nextProfile)
    setProfileFormError('')
    setIsProfileModalOpen(false)
  }

  const resetWorkTypeForm = (
    nextCenterId = selectedCenterId || centers[0]?.id || '',
    nextDispatchSiteId = CENTER_DISPATCH_SITE_ID,
  ) => {
    setEditingTypeId(null)
    setTypeCenterIdInput(nextCenterId)
    setTypeDispatchSiteIdInput(nextDispatchSiteId || CENTER_DISPATCH_SITE_ID)
    setTypeLabelInput('')
    setTypeColorIdxInput(0)
    setTypeFormError('')
  }

  const clearWorkTypeReorderTimer = () => {
    if (workTypeReorderTimerRef.current) {
      window.clearTimeout(workTypeReorderTimerRef.current)
      workTypeReorderTimerRef.current = null
    }
  }

  const moveWorkTypeOrder = (draggedTypeId, targetTypeId) => {
    if (!draggedTypeId || !targetTypeId || draggedTypeId === targetTypeId) return

    setWorkTypes((prev) => {
      const isInCurrentScope = (type) =>
        type.centerId === selectedCenterId &&
        (type.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === typeDispatchSiteIdInput

      const scopedTypes = prev.filter(isInCurrentScope)
      const fromIndex = scopedTypes.findIndex((type) => type.id === draggedTypeId)
      const toIndex = scopedTypes.findIndex((type) => type.id === targetTypeId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev

      hasWorkTypeOrderChangedRef.current = true
      const reorderedScoped = [...scopedTypes]
      const [moved] = reorderedScoped.splice(fromIndex, 1)
      reorderedScoped.splice(toIndex, 0, moved)

      let scopedCursor = 0
      return prev.map((type) => {
        if (!isInCurrentScope(type)) return type
        const nextType = reorderedScoped[scopedCursor]
        scopedCursor += 1
        return nextType
      })
    })
  }

  const startOrderLongPress = (event, typeId) => {
    if (event.button !== undefined && event.button !== 0) return
    if (draggingOrderTypeId) return

    setPressedOrderTypeId(typeId)
    clearWorkTypeReorderTimer()
    workTypeReorderTimerRef.current = window.setTimeout(() => {
      workTypeReorderTimerRef.current = null
      setPressedOrderTypeId(null)
      setDraggingOrderTypeId(typeId)
      workTypeDragLastTargetRef.current = null
    }, WORK_TYPE_REORDER_LONG_PRESS_MS)
  }

  const handleOrderPointerMove = (event) => {
    if (!draggingOrderTypeId) return

    const hitElement = document.elementFromPoint(event.clientX, event.clientY)
    const rowElement = hitElement?.closest?.('[data-order-type-id]')
    const targetTypeId = rowElement?.getAttribute?.('data-order-type-id')
    if (!targetTypeId) return

    if (targetTypeId === draggingOrderTypeId) {
      workTypeDragLastTargetRef.current = null
      return
    }

    if (workTypeDragLastTargetRef.current === targetTypeId) return
    moveWorkTypeOrder(draggingOrderTypeId, targetTypeId)
    workTypeDragLastTargetRef.current = targetTypeId
  }

  const openWorkTypeModal = () => {
    setIsStatusModalOpen(false)
    setIsProfileModalOpen(false)
    setActiveManageModal('workType')
    resetWorkTypeForm(selectedCenterId || centers[0]?.id || '')
  }

  const addCenter = () => {
    const nextCenterName = centerNameInput.trim()
    if (!nextCenterName) {
      setCenterFormError('센터 이름을 입력해 주세요.')
      return
    }

    if (centers.some((center) => center.name === nextCenterName)) {
      setCenterFormError('이미 등록된 센터입니다.')
      return
    }

    markLocalSharedChange()
    const newCenter = { id: createCenterId(), name: nextCenterName }
    setCenters((prev) => [...prev, newCenter])
    setCenterNameInput('')
    setCenterFormError('')
    setSelectedCenterId(newCenter.id)
    setTypeCenterIdInput(newCenter.id)
    setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
  }

  const openCenterManageModal = (returnModal = 'workType') => {
    setCenterFormError('')
    setCenterNameInput('')
    setCenterEditInput('')
    setEditingCenterId(null)
    setDispatchSiteInput('')
    setDispatchEditInput('')
    setEditingDispatchSiteId(null)
    setDispatchFormError('')
    setCenterManageReturnModal(returnModal)
    if (activeManageModal === 'workType') {
      setActiveManageModal(null)
      window.requestAnimationFrame(() => {
        setActiveManageModal('centerManage')
      })
      return
    }
    setActiveManageModal('centerManage')
  }

  const closeCenterManageModal = () => {
    setActiveManageModal(centerManageReturnModal === 'workType' ? 'workType' : null)
    setCenterManageReturnModal(null)
    setCenterFormError('')
    setCenterEditInput('')
    setEditingCenterId(null)
    setDispatchSiteInput('')
    setDispatchEditInput('')
    setEditingDispatchSiteId(null)
    setDispatchFormError('')
  }

  const startEditCenter = (center) => {
    setEditingCenterId(center.id)
    setCenterEditInput(center.name)
    setCenterFormError('')
  }

  const saveCenterEdit = () => {
    if (!editingCenterId) return
    const nextCenterName = centerEditInput.trim()

    if (!nextCenterName) {
      setCenterFormError('센터 이름을 입력해 주세요.')
      return
    }

    if (
      centers.some((center) => center.name === nextCenterName && center.id !== editingCenterId)
    ) {
      setCenterFormError('이미 등록된 센터입니다.')
      return
    }

    markLocalSharedChange()
    setCenters((prev) =>
      prev.map((center) =>
        center.id === editingCenterId ? { ...center, name: nextCenterName } : center,
      ),
    )
    setCenterEditInput('')
    setEditingCenterId(null)
    setCenterFormError('')
  }

  const removeCenter = (centerId) => {
    const targetCenter = centers.find((center) => center.id === centerId)
    if (!targetCenter) return

    if (centers.length <= 1) {
      setCenterFormError('최소 1개의 센터는 유지되어야 합니다.')
      return
    }

    const targetTypeIds = workTypes
      .filter((type) => type.centerId === centerId)
      .map((type) => type.id)
    const targetDispatchCount = dispatchSites.filter((site) => site.centerId === centerId).length

    const usedInMyScheduleCount = Object.values(mySchedules).filter((scheduleTypeId) =>
      targetTypeIds.includes(scheduleTypeId),
    ).length

    const confirmMessage =
      usedInMyScheduleCount > 0
        ? `'${targetCenter.name}' 센터를 삭제하면 근무형태, 근무지 ${targetDispatchCount}개, 내 일정 ${usedInMyScheduleCount}건도 함께 삭제됩니다. 계속할까요?`
        : `'${targetCenter.name}' 센터를 삭제하면 근무지 ${targetDispatchCount}개도 함께 삭제됩니다. 계속할까요?'`

    if (!confirmAction(confirmMessage)) return

    markLocalSharedChange({ includesSchedule: true })
    const nextCenters = centers.filter((center) => center.id !== centerId)
    const fallbackCenterId = nextCenters[0]?.id || ''
    const pendingDispatchAdds = pendingAddedDispatchSiteIdsRef.current

    setCenters(nextCenters)
    setWorkTypes((prev) => prev.filter((type) => type.centerId !== centerId))
    setDispatchSites((prev) => prev.filter((site) => site.centerId !== centerId))
    Array.from(pendingDispatchAdds.entries()).forEach(([pendingSiteId]) => {
      const pendingSite = dispatchSites.find((site) => site.id === pendingSiteId)
      if (pendingSite?.centerId === centerId) {
        pendingDispatchAdds.delete(pendingSiteId)
      }
    })
    setMySchedules((prev) => {
      const next = {}
      Object.entries(prev).forEach(([dateStr, scheduleTypeId]) => {
        if (!targetTypeIds.includes(scheduleTypeId)) {
          next[dateStr] = scheduleTypeId
        }
      })
      return next
    })

    if (selectedCenterId === centerId) {
      setSelectedCenterId(fallbackCenterId)
      setTypeCenterIdInput(fallbackCenterId)
      setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
    }

    if (typeCenterIdInput === centerId) {
      setTypeCenterIdInput(fallbackCenterId)
      setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
    }

    if (editingTypeId) {
      const editingType = workTypes.find((type) => type.id === editingTypeId)
      if (editingType?.centerId === centerId) {
        resetWorkTypeForm(fallbackCenterId)
      }
    }

    if (editingCenterId === centerId) {
      setEditingCenterId(null)
      setCenterEditInput('')
    }

    if (editingDispatchSiteId) {
      const editingSite = dispatchSites.find((site) => site.id === editingDispatchSiteId)
      if (editingSite?.centerId === centerId) {
        setEditingDispatchSiteId(null)
        setDispatchEditInput('')
        setDispatchFormError('')
      }
    }
  }

  const addDispatchSite = () => {
    const nextName = dispatchSiteInput.trim()

    if (!selectedCenterId) {
      setDispatchFormError('센터를 먼저 선택해 주세요.')
      return
    }

    if (!nextName) {
      setDispatchFormError('근무지 이름을 입력해 주세요.')
      return
    }

    if (
      dispatchSites.some((site) => site.centerId === selectedCenterId && site.name === nextName)
    ) {
      setDispatchFormError('이미 등록된 근무지입니다.')
      return
    }

    markLocalSharedChange()
    const newDispatchSite = { id: createDispatchSiteId(), centerId: selectedCenterId, name: nextName }
    pendingAddedDispatchSiteIdsRef.current.set(newDispatchSite.id, {
      expiresAt: Date.now() + 8000,
    })
    setDispatchSites((prev) => [...prev, newDispatchSite])
    setDispatchSiteInput('')
    setDispatchFormError('')
  }

  const startEditDispatchSite = (site) => {
    setEditingDispatchSiteId(site.id)
    setDispatchEditInput(site.name)
    setDispatchFormError('')
  }

  const saveDispatchSiteEdit = () => {
    if (!editingDispatchSiteId) return
    const nextName = dispatchEditInput.trim()

    if (!nextName) {
      setDispatchFormError('근무지 이름을 입력해 주세요.')
      return
    }

    const editingSite = dispatchSites.find((site) => site.id === editingDispatchSiteId)
    if (!editingSite) return

    if (
      dispatchSites.some(
        (site) =>
          site.centerId === editingSite.centerId &&
          site.name === nextName &&
          site.id !== editingDispatchSiteId,
      )
    ) {
      setDispatchFormError('이미 등록된 근무지입니다.')
      return
    }

    markLocalSharedChange()
    setDispatchSites((prev) =>
      prev.map((site) => (site.id === editingDispatchSiteId ? { ...site, name: nextName } : site)),
    )
    setEditingDispatchSiteId(null)
    setDispatchEditInput('')
    setDispatchFormError('')
  }

  const removeDispatchSite = (siteId) => {
    const target = dispatchSites.find((site) => site.id === siteId)
    if (!target) return
    pendingAddedDispatchSiteIdsRef.current.delete(siteId)

    const affectedWorkTypeCount = workTypes.filter(
      (type) =>
        type.centerId === target.centerId &&
        (type.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === target.id,
    ).length

    const confirmMessage =
      affectedWorkTypeCount > 0
        ? `'${target.name}' 근무지를 삭제하면 연결된 근무형태 ${affectedWorkTypeCount}개는 '${centers.find((center) => center.id === target.centerId)?.name || '센터'}/센터'로 이동됩니다. 계속할까요?`
        : `'${target.name}' 근무지를 삭제할까요?`

    if (!confirmAction(confirmMessage)) return

    markLocalSharedChange()
    setDispatchSites((prev) => prev.filter((site) => site.id !== siteId))
    setWorkTypes((prev) =>
      prev.map((type) =>
        type.centerId === target.centerId &&
        (type.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === target.id
          ? { ...type, dispatchSiteId: CENTER_DISPATCH_SITE_ID }
          : type,
      ),
    )
    if (editingDispatchSiteId === siteId) {
      setEditingDispatchSiteId(null)
      setDispatchEditInput('')
      setDispatchFormError('')
    }

    if (typeCenterIdInput === target.centerId && typeDispatchSiteIdInput === siteId) {
      setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
    }
  }

  const startEditWorkType = (type) => {
    setEditingTypeId(type.id)
    setTypeCenterIdInput(type.centerId)
    setTypeDispatchSiteIdInput(type.dispatchSiteId || CENTER_DISPATCH_SITE_ID)
    setTypeLabelInput(type.label)
    setTypeColorIdxInput(type.colorIdx)
    setTypeFormError('')
    setSelectedCenterId(type.centerId)
  }

  const saveWorkType = () => {
    const nextLabel = typeLabelInput.trim()
    const nextCenterId = typeCenterIdInput || selectedCenterId || centers[0]?.id || ''
    const nextDispatchSiteIdCandidate = typeDispatchSiteIdInput || CENTER_DISPATCH_SITE_ID

    if (!nextCenterId) {
      setTypeFormError('센터를 먼저 선택해 주세요.')
      return
    }

    if (!nextLabel) {
      setTypeFormError('근무형태 이름을 입력해 주세요.')
      return
    }

    const isDispatchValidForCenter =
      nextDispatchSiteIdCandidate === CENTER_DISPATCH_SITE_ID ||
      dispatchSites.some(
        (site) => site.id === nextDispatchSiteIdCandidate && site.centerId === nextCenterId,
      )
    const nextDispatchSiteId = isDispatchValidForCenter
      ? nextDispatchSiteIdCandidate
      : CENTER_DISPATCH_SITE_ID

    markLocalSharedChange()
    if (editingTypeId) {
      const currentType = workTypes.find((type) => type.id === editingTypeId)
      const nextEditedType = normalizeWorkType({
        ...(currentType || {}),
        id: editingTypeId,
        centerId: nextCenterId,
        dispatchSiteId: nextDispatchSiteId,
        label: nextLabel,
        colorIdx: typeColorIdxInput,
      })
      pendingEditedWorkTypesRef.current.set(editingTypeId, {
        expiresAt: Date.now() + 15000,
        type: nextEditedType,
      })
      pendingDeletedWorkTypeIdsRef.current.delete(editingTypeId)
      pendingAddedWorkTypeIdsRef.current.delete(editingTypeId)
      setWorkTypes((prev) =>
        prev.map((type) =>
          type.id === editingTypeId
            ? nextEditedType
            : type,
        ),
      )
    } else {
      const newType = {
        id: createWorkTypeId(),
        centerId: nextCenterId,
        dispatchSiteId: nextDispatchSiteId,
        label: nextLabel,
        colorIdx: typeColorIdxInput,
      }
      pendingAddedWorkTypeIdsRef.current.set(newType.id, {
        expiresAt: Date.now() + 8000,
      })
      setWorkTypes((prev) => [
        ...prev,
        newType,
      ])
    }

    setSelectedCenterId(nextCenterId)
    resetWorkTypeForm(nextCenterId, nextDispatchSiteId)
  }

  const removeWorkType = (typeId) => {
    const target = workTypes.find((type) => type.id === typeId)
    if (!target) {
      setTypeFormError('삭제 대상 근무형태를 찾지 못했습니다.')
      return
    }

    const usedInMyScheduleCount = Object.values(mySchedules).filter(
      (scheduleTypeId) => scheduleTypeId === typeId,
    ).length

    const deleteNotice =
      usedInMyScheduleCount > 0
        ? `'${target.label}' 삭제 처리 중... (내 일정 ${usedInMyScheduleCount}건 함께 정리)`
        : `'${target.label}' 삭제 처리 중...`
    setTypeFormError(deleteNotice)
    markLocalSharedChange({ includesSchedule: true })
    pendingDeletedWorkTypeIdsRef.current.set(typeId, {
      label: target.label,
      // 여러 기기 동기화 지연/충돌로 항목이 되살아나는 경우를 흡수하기 위해
      // 삭제 보류 상태를 충분히 길게 유지한다.
      expiresAt: Date.now() + 5 * 60 * 1000,
    })

    clearWorkTypeReorderTimer()
    setPressedOrderTypeId(null)
    setDraggingOrderTypeId(null)
    workTypeDragLastTargetRef.current = null
    pendingAddedWorkTypeIdsRef.current.delete(typeId)
    pendingEditedWorkTypesRef.current.delete(typeId)

    setWorkTypes((prev) => prev.filter((type) => type.id !== typeId))
    setMySchedules((prev) => {
      const next = {}
      Object.entries(prev).forEach(([dateStr, scheduleTypeId]) => {
        if (scheduleTypeId !== typeId) next[dateStr] = scheduleTypeId
      })
      return next
    })
    setSharedUserSchedules((prev) => {
      if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return prev
      const next = {}
      Object.entries(prev).forEach(([userKey, schedules]) => {
        if (!schedules || typeof schedules !== 'object' || Array.isArray(schedules)) {
          next[userKey] = {}
          return
        }
        const filteredSchedules = {}
        Object.entries(schedules).forEach(([dateStr, scheduleTypeId]) => {
          if (scheduleTypeId !== typeId) filteredSchedules[dateStr] = scheduleTypeId
        })
        next[userKey] = filteredSchedules
      })
      return next
    })

    if (editingTypeId === typeId) {
      resetWorkTypeForm()
    }

    window.setTimeout(() => {
      const existsAfterDelete = latestWorkTypesRef.current.some((type) => type.id === typeId)
      setTypeFormError(
        existsAfterDelete
          ? `'${target.label}' 삭제 요청 후 다시 나타났습니다. 동기화 충돌이 발생했습니다.`
          : `'${target.label}' 삭제 완료`,
      )
    }, 220)
  }

  const requestRemoveWorkType = (typeId) => {
    const now = Date.now()
    if (lastDeleteActionRef.current.id === typeId && now - lastDeleteActionRef.current.at < 600) {
      return
    }
    lastDeleteActionRef.current = { id: typeId, at: now }
    removeWorkType(typeId)
  }

  useEffect(() => {
    const pendingEntries = Array.from(pendingDeletedWorkTypeIdsRef.current.entries())
    if (!pendingEntries.length) return

    const now = Date.now()
    let shouldForceCleanup = false
    let latestRecoveredLabel = ''

    pendingEntries.forEach(([typeId, meta]) => {
      if (!meta || typeof meta !== 'object') {
        pendingDeletedWorkTypeIdsRef.current.delete(typeId)
        return
      }
      if (meta.expiresAt <= now) {
        pendingDeletedWorkTypeIdsRef.current.delete(typeId)
        return
      }

      const stillExists = workTypes.some((type) => type.id === typeId)
      if (stillExists) {
        shouldForceCleanup = true
        latestRecoveredLabel = meta.label || latestRecoveredLabel
      }
    })

    if (!shouldForceCleanup) return

    const pendingIdSet = new Set(pendingDeletedWorkTypeIdsRef.current.keys())
    markLocalSharedChange({ includesSchedule: true })
    setWorkTypes((prev) => prev.filter((type) => !pendingIdSet.has(type.id)))
    setMySchedules((prev) => {
      const next = {}
      Object.entries(prev).forEach(([dateStr, scheduleTypeId]) => {
        if (!pendingIdSet.has(scheduleTypeId)) {
          next[dateStr] = scheduleTypeId
        }
      })
      return next
    })
    if (latestRecoveredLabel) {
      setTypeFormError(
        `'${latestRecoveredLabel}' 삭제가 서버 동기화로 되돌아와 자동으로 다시 삭제했습니다. 다른 기기 화면도 새로고침해 주세요.`,
      )
    }
  }, [workTypes, markLocalSharedChange])

  const isDateInCurrentMonth = (dateStr) => {
    const parsed = parseLocalYmdDate(dateStr)
    if (!parsed) return false
    return parsed.getFullYear() === year && parsed.getMonth() === month
  }

  const getDefaultRegistrationDate = () => {
    if (isDateInCurrentMonth(todayStr)) return todayStr
    return formatDate(new Date(year, month, 1))
  }

  const resolveRegistrationDate = () => {
    if (selectedDayStr && isDateInCurrentMonth(selectedDayStr)) return selectedDayStr
    const fallbackDate = getDefaultRegistrationDate()
    setSelectedDayStr(fallbackDate)
    return fallbackDate
  }

  const openRegistrationMode = (panel) => {
    setIsStatusModalOpen(false)
    setRegistrationPanel(panel)
    resolveRegistrationDate()
    setIsRegistrationMode(true)
  }

  const handleDateClick = (dateStr) => {
    setSelectedDayStr(dateStr)
    if (!isRegistrationMode) setIsStatusModalOpen(true)
  }

  const applyWork = (typeId, baseDateStr) => {
    if (!baseDateStr) return
    markLocalSharedChange({ includesSchedule: true })

    setMySchedules((prev) => {
      const next = { ...prev, [baseDateStr]: typeId }
      if (typeId === null) delete next[baseDateStr]
      return next
    })

    // 근무 등록 후 다음 날짜로 자동 이동 (삭제는 현재 날짜 유지)
    if (typeId === null) return
    const baseDate = parseLocalYmdDate(baseDateStr)
    if (!baseDate) return

    const nextDate = new Date(baseDate)
    nextDate.setDate(baseDate.getDate() + 1)
    const nextDateStr = formatDate(nextDate)

    setSelectedDayStr(nextDateStr)
    setCurrentDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }

  const requestApplyWork = (typeId) => {
    const targetDayStr = selectedDayStr || resolveRegistrationDate() || ''
    if (!targetDayStr) return
    const now = Date.now()
    if (
      lastWorkTapRef.current.typeId === typeId &&
      lastWorkTapRef.current.dayStr === targetDayStr &&
      now - lastWorkTapRef.current.at < 150
    ) {
      return
    }
    lastWorkTapRef.current = { typeId, dayStr: targetDayStr, at: now }
    applyWork(typeId, targetDayStr)
  }

  const addDayNote = () => {
    const targetDateStr = resolveRegistrationDate()
    if (!targetDateStr) return

    if (!activeScheduleCenterId) {
      setDayNoteError('센터를 먼저 선택해 주세요.')
      return
    }

    const nextNote = dayNoteInput.trim()
    if (!nextNote) {
      setDayNoteError('추가 일정 내용을 입력해 주세요.')
      return
    }

    markLocalSharedChange()
    setDailyNotes((prev) => {
      const current = prev[targetDateStr] ?? []
      return {
        ...prev,
        [targetDateStr]: [
          ...current,
          {
            id: createDayNoteId(),
            text: nextNote,
            centerId: activeScheduleCenterId,
          },
        ],
      }
    })
    setDayNoteInput('')
    setDayNoteError('')
  }

  const removeDayNote = (noteId) => {
    const targetDateStr = resolveRegistrationDate()
    if (!targetDateStr) return

    markLocalSharedChange()
    setDailyNotes((prev) => {
      const current = prev[targetDateStr] ?? []
      const normalizedCurrent = current.reduce((acc, note, idx) => {
        const normalized = normalizeDailyNoteEntry(note, `legacy-note-${targetDateStr}-${idx}`)
        if (normalized) acc.push(normalized)
        return acc
      }, [])
      const nextNotes = normalizedCurrent.filter(
        (note) => !(note.id === noteId && note.centerId === activeScheduleCenterId),
      )
      const next = { ...prev }

      if (nextNotes.length === 0) {
        delete next[targetDateStr]
      } else {
        next[targetDateStr] = nextNotes
      }

      return next
    })
  }

  const addPeriodSchedule = () => {
    const targetDateStr = resolveRegistrationDate()
    const nextLabel = periodLabelInput.trim()
    if (!nextLabel) {
      setPeriodFormError('기간 일정 이름을 입력해 주세요.')
      return
    }
    if (!activeScheduleCenterId) {
      setPeriodFormError('센터를 먼저 선택해 주세요.')
      return
    }

    const startDateInput = periodStartInput || targetDateStr
    const endDateInput = periodEndInput || targetDateStr

    if (!startDateInput || !endDateInput) {
      setPeriodFormError('시작일과 종료일을 선택해 주세요.')
      return
    }

    const [startDate, endDate] = sortDateRange(startDateInput, endDateInput)
    markLocalSharedChange()
    setPeriodSchedules((prev) => [
      ...prev,
      {
        id: createPeriodScheduleId(),
        label: nextLabel,
        startDate,
        endDate,
        centerId: activeScheduleCenterId,
      },
    ])

    setPeriodLabelInput('')
    setPeriodStartInput(startDate)
    setPeriodEndInput(endDate)
    setPeriodFormError('')
  }

  const removePeriodSchedule = (periodId) => {
    markLocalSharedChange()
    setPeriodSchedules((prev) =>
      prev.filter((item) => !(item.id === periodId && getPeriodCenterId(item) === activeScheduleCenterId)),
    )
  }

  const getGroupedWorkers = (dateStr) => {
    if (!dateStr) return {}

    const grouped = {}
    const validTypeIds = new Set(workTypes.map((type) => type.id))

    workTypes.forEach((type) => {
      grouped[type.id] = []
    })

    otherUsersData.forEach((user) => {
      const typeId = user.schedules[dateStr]
      if (typeId && validTypeIds.has(typeId)) grouped[typeId].push({ name: user.userName, isMe: false })
    })

    const myTypeId = mySchedules[dateStr]
    if (myTypeId && validTypeIds.has(myTypeId)) {
      grouped[myTypeId].push({ name: profile.name.trim() || '나', isMe: true })
    }

    return grouped
  }

  const selectedDayLabel = selectedDayStr ?? '날짜를 선택하세요'
  const selectedTypeId = selectedDayStr ? mySchedules[selectedDayStr] : null
  const selectedDayAutoHolidayNotes = selectedDayStr ? autoHolidayNotesByDate[selectedDayStr] ?? [] : []
  const selectedDayManualNoteEntries = selectedDayStr
    ? getCenterScopedManualNoteEntries(dailyNotes[selectedDayStr] ?? [], activeScheduleCenterId)
    : []
  const selectedDayManualNotes = selectedDayManualNoteEntries.map((item) => item.text)
  const selectedDayPeriodSchedules = selectedDayStr
    ? centerPeriodSchedules.filter((item) => isDateInRange(selectedDayStr, item.startDate, item.endDate))
    : []
  const selectedDayCalendarEvents = (() => {
    if (!selectedDayStr) return []
    const raw = calendarEventsByDate[selectedDayStr] ?? []
    const existingLower = [
      ...selectedDayAutoHolidayNotes,
      ...selectedDayManualNotes,
    ].map((n) => n.toLowerCase())
    return raw.filter((ev) => {
      const evLower = ev.toLowerCase()
      return !existingLower.some((n) => n === evLower || n.includes(evLower))
    })
  })()
  const selectedDayScheduleItems = [
    ...selectedDayAutoHolidayNotes.map((label, idx) => ({
      id: `holiday-${selectedDayStr || 'none'}-${idx}`,
      kind: 'holiday',
      label,
      meta: '공휴일(자동)',
    })),
    ...selectedDayPeriodSchedules.map((item) => ({
      id: `period-${item.id}`,
      kind: 'period',
      label: item.label,
      meta: `${item.startDate} ~ ${item.endDate}`,
    })),
    ...selectedDayManualNotes.map((note, idx) => ({
      id: `note-${selectedDayStr || 'none'}-${idx}`,
      kind: 'note',
      label: note,
      meta: '추가 일정',
    })),
    ...selectedDayCalendarEvents.map((ev, idx) => ({
      id: `calendar-${selectedDayStr || 'none'}-${idx}`,
      kind: 'calendar',
      label: ev,
      meta: '캘린더',
    })),
  ]
  const workersByType = useMemo(
    () => getGroupedWorkers(selectedDayStr),
    [selectedDayStr, workTypes, otherUsersData, mySchedules, profile.name],
  )
  const statusWorkersByType = useMemo(() => {
    const normalizeText = (value) => value.replace(/\s+/g, '').toLowerCase()
    const findType = (predicate) => workTypes.find((type) => predicate(type))
    const dispatchNameById = new Map(
      dispatchSites.map((site) => [site.id, getDispatchLabelText(site.name)]),
    )

    const isDispatchMatch = (type, dispatchLabel) =>
      dispatchNameById.get(type.dispatchSiteId) === dispatchLabel

    const isLabelMatch = (type, keyword) => normalizeText(type.label).includes(normalizeText(keyword))

    const normalType = workTypes.find((type) => type.label === '정상')
    const offType = workTypes.find((type) => type.label === '휴무')
    const jindoAType =
      findType((type) => isDispatchMatch(type, '진도') && isLabelMatch(type, '근무A')) ||
      findType((type) => isLabelMatch(type, '근무A(진도)'))
    const jindoBType =
      findType((type) => isDispatchMatch(type, '진도') && isLabelMatch(type, '근무B')) ||
      findType((type) => isLabelMatch(type, '근무B(진도)'))
    const namgangAType = findType(
      (type) => isDispatchMatch(type, '남강') && isLabelMatch(type, '근무A'),
    )
    const namgangBType = findType(
      (type) => isDispatchMatch(type, '남강') && isLabelMatch(type, '근무B'),
    )

    const next = { ...workersByType }

    if (!isFirebaseConfigured) {
      if (normalType) {
        next[normalType.id] = STATUS_PREVIEW_NORMAL_NAMES.map((name) => ({ name, isMe: false }))
      }
      if (offType) {
        next[offType.id] = STATUS_PREVIEW_OFF_NAMES.map((name) => ({ name, isMe: false }))
      }
      if (jindoAType) {
        next[jindoAType.id] = STATUS_PREVIEW_JINDO_A_NAMES.map((name) => ({ name, isMe: false }))
      }
      if (jindoBType) {
        next[jindoBType.id] = STATUS_PREVIEW_JINDO_B_NAMES.map((name) => ({ name, isMe: false }))
      }
      if (namgangAType) {
        next[namgangAType.id] = STATUS_PREVIEW_NAMGANG_A_NAMES.map((name) => ({ name, isMe: false }))
      }
      if (namgangBType) {
        next[namgangBType.id] = STATUS_PREVIEW_NAMGANG_B_NAMES.map((name) => ({ name, isMe: false }))
      }
    }

    if (isTutorialDemoMode) {
      let fillIndex = 0
      workTypes.forEach((type) => {
        const workers = Array.isArray(next[type.id]) ? next[type.id] : []
        if (workers.length) return
        const fallbackName = STATUS_PREVIEW_FILL_NAMES[fillIndex % STATUS_PREVIEW_FILL_NAMES.length]
        next[type.id] = [{ name: fallbackName, isMe: false }]
        fillIndex += 1
      })
    }

    return next
  }, [workersByType, workTypes, dispatchSites, isTutorialDemoMode])
  const selectedCenter = centers.find((center) => center.id === selectedCenterId) ?? centers[0]
  const selectedCenterWorkTypes = workTypes.filter((type) => type.centerId === selectedCenterId)
  const selectedCenterDispatchSites = dispatchSites.filter((site) => site.centerId === selectedCenterId)
  const selectedCenterDispatchOptions = useMemo(
    () => [
      { id: CENTER_DISPATCH_SITE_ID, label: '센터' },
      ...selectedCenterDispatchSites.map((site) => ({
        id: site.id,
        label: getDispatchLabelText(site.name),
      })),
    ],
    [selectedCenterDispatchSites],
  )
  const profileCenterDispatchSites = dispatchSites.filter(
    (site) => site.centerId === profileCenterIdInput,
  )
  const profileDispatchOptions = useMemo(
    () => [
      { id: CENTER_DISPATCH_SITE_ID, label: '센터' },
      ...profileCenterDispatchSites.map((site) => ({
        id: site.id,
        label: getDispatchLabelText(site.name),
      })),
    ],
    [profileCenterDispatchSites],
  )
  const selectedDispatchLabel =
    selectedCenterDispatchOptions.find((option) => option.id === typeDispatchSiteIdInput)?.label || '센터'
  const filteredSelectedCenterWorkTypes = useMemo(
    () =>
      selectedCenterWorkTypes.filter(
        (type) => (type.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === typeDispatchSiteIdInput,
      ),
    [selectedCenterWorkTypes, typeDispatchSiteIdInput],
  )
  const isRegistrationPopupVisible =
    activeSection === MAIN_SECTION_ID && isRegistrationMode && Boolean(selectedDayStr)
  const registrationCenter = centers.find((center) => center.id === profile.centerId) || null
  const registrationDispatchSiteId = profile.dispatchSiteId || CENTER_DISPATCH_SITE_ID
  const registrationDispatchSite = dispatchSites.find(
    (site) => site.id === registrationDispatchSiteId && site.centerId === registrationCenter?.id,
  )
  const registrationDispatchLabel =
    registrationDispatchSiteId === CENTER_DISPATCH_SITE_ID
      ? '센터'
      : registrationDispatchSite
        ? getDispatchLabelText(registrationDispatchSite.name)
        : ''
  const isRegistrationDispatchValid =
    registrationDispatchSiteId === CENTER_DISPATCH_SITE_ID ||
    Boolean(registrationDispatchSite)
  const registrationWorkTypes =
    registrationCenter && isRegistrationDispatchValid
      ? workTypes.filter(
          (type) =>
            type.centerId === registrationCenter.id &&
            (type.dispatchSiteId || CENTER_DISPATCH_SITE_ID) === registrationDispatchSiteId,
        )
      : []
  const registrationBottomInset = registrationPopupHeight + REGISTRATION_SAFE_GAP

  useEffect(() => {
    if (!isRegistrationMode) return
    const selectedDate = parseLocalYmdDate(selectedDayStr)
    const isSelectedInCurrentMonth =
      selectedDate &&
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month
    if (isSelectedInCurrentMonth) return

    const todayDate = parseLocalYmdDate(todayStr)
    const fallbackDate =
      todayDate && todayDate.getFullYear() === year && todayDate.getMonth() === month
        ? todayStr
        : formatDate(new Date(year, month, 1))
    setSelectedDayStr(fallbackDate)
  }, [isRegistrationMode, selectedDayStr, year, month, todayStr])

  useEffect(() => {
    if (!isRegistrationPopupVisible) return

    const measurePopupHeight = () => {
      const popupHeight = registrationPopupRef.current?.getBoundingClientRect().height
      if (!popupHeight) return
      setRegistrationPopupHeight(Math.ceil(popupHeight))
    }

    let rafId = 0
    let rafId2 = 0
    rafId = window.requestAnimationFrame(() => {
      rafId2 = window.requestAnimationFrame(measurePopupHeight)
    })

    window.addEventListener('resize', measurePopupHeight)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.cancelAnimationFrame(rafId2)
      window.removeEventListener('resize', measurePopupHeight)
    }
  }, [isRegistrationPopupVisible, selectedDayStr])

  useEffect(() => {
    if (!isRegistrationPopupVisible || !selectedDayStr) return
    const mainEl = mainScrollRef.current
    const cellEl = dayCellRefs.current[selectedDayStr]
    if (!mainEl || !cellEl || !cellEl.isConnected || !mainEl.contains(cellEl)) return

    let rafId = 0
    let rafId2 = 0

    rafId = window.requestAnimationFrame(() => {
      rafId2 = window.requestAnimationFrame(() => {
        const mainRect = mainEl.getBoundingClientRect()
        const cellRect = cellEl.getBoundingClientRect()
        const cellTopInMain = cellRect.top - mainRect.top + mainEl.scrollTop
        const maxScrollTop = Math.max(0, mainEl.scrollHeight - mainEl.clientHeight)
        const targetScrollTop = Math.max(0, Math.min(maxScrollTop, cellTopInMain - 12))
        mainEl.scrollTo({ top: targetScrollTop, behavior: 'auto' })
      })
    })

    return () => {
      window.cancelAnimationFrame(rafId)
      window.cancelAnimationFrame(rafId2)
    }
  }, [isRegistrationPopupVisible, selectedDayStr, registrationPopupHeight])

  useEffect(
    () => () => {
      if (mainScrollHideTimerRef.current) {
        window.clearTimeout(mainScrollHideTimerRef.current)
      }
      if (workTypeReorderTimerRef.current) {
        window.clearTimeout(workTypeReorderTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!pressedOrderTypeId && !draggingOrderTypeId) return undefined

    const handlePointerUp = () => {
      const hadDraggingOrder = Boolean(draggingOrderTypeId)
      const hadOrderChanged = hasWorkTypeOrderChangedRef.current
      if (workTypeReorderTimerRef.current) {
        window.clearTimeout(workTypeReorderTimerRef.current)
        workTypeReorderTimerRef.current = null
      }
      setPressedOrderTypeId(null)
      setDraggingOrderTypeId(null)
      workTypeDragLastTargetRef.current = null
      if (hadDraggingOrder && hadOrderChanged) {
        markLocalSharedChange()
      }
      hasWorkTypeOrderChangedRef.current = false
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [pressedOrderTypeId, draggingOrderTypeId, markLocalSharedChange])

  useEffect(() => {
    clearWorkTypeReorderTimer()
    setPressedOrderTypeId(null)
    setDraggingOrderTypeId(null)
    workTypeDragLastTargetRef.current = null
    hasWorkTypeOrderChangedRef.current = false
    // 센터/근무지 변경 시 다른 목록으로 넘어가므로 순서 드래그 상태 초기화
  }, [selectedCenterId, typeDispatchSiteIdInput])

  const handleMainScroll = () => {
    setIsMainScrolling(true)
    if (mainScrollHideTimerRef.current) {
      window.clearTimeout(mainScrollHideTimerRef.current)
    }
    mainScrollHideTimerRef.current = window.setTimeout(() => {
      setIsMainScrolling(false)
    }, MAIN_SCROLLBAR_HIDE_DELAY_MS)
  }

  const moveSpotlightStep = (offset) => {
    setSpotlightStepIndex((prev) => Math.max(0, Math.min(totalSpotlightSteps - 1, prev + offset)))
  }

  const exitOnboardingPreviewMode = () => {
    if (typeof window === 'undefined') return
    if (!isOnboardingPreviewMode) {
      markOnboardingTutorialCompleted()
      setIsSpotlightTutorialOpen(false)
      setSpotlightStepIndex(0)
      setSpotlightTargetRect(null)
      setSpotlightSecondaryTargetRect(null)
      setSpotlightCardTop(null)
      setIsFavoritePickerOpen(false)
      setIsRegistrationMode(false)
      setIsStatusModalOpen(false)
      setIsProfileModalOpen(false)
      setActiveManageModal(null)
      setActiveHelpTopicId('')
      setActiveSection(MAIN_SECTION_ID)
      return
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete(ONBOARDING_PREVIEW_QUERY_KEY)
      url.searchParams.delete(ONBOARDING_TUTORIAL_DATA_QUERY_KEY)
      if (url.searchParams.get('onboarding') === 'preview') {
        url.searchParams.delete('onboarding')
      }
      window.location.assign(`${url.pathname}${url.search}${url.hash}`)
    } catch {
      window.location.assign(window.location.pathname || '/')
    }
  }

  const openHelpModal = (topicId) => {
    if (!topicId || !ONBOARDING_SPOTLIGHT_STEPS.some((step) => step.id === topicId)) return
    setActiveHelpTopicId(topicId)
  }

  const closeHelpModal = () => {
    setActiveHelpTopicId('')
  }

  const openSection = (nextSectionId) => {
    if (nextSectionId === activeSection) return
    setIsFavoritePickerOpen(false)
    closeHelpModal()
    if (nextSectionId !== MAIN_SECTION_ID) {
      setIsRegistrationMode(false)
      setIsStatusModalOpen(false)
    }
    setActiveSection(nextSectionId)
  }

  const toggleFavoriteUser = (userId) => {
    setFavoriteUserKeys((prev) =>
      prev.includes(userId) ? prev.filter((savedUserId) => savedUserId !== userId) : [...prev, userId],
    )
  }

  const calendarCells = useMemo(() => {
    const firstVisibleDate = new Date(year, month, 1 - firstDayOfMonth)
    return Array.from({ length: 42 }).map((_, index) => {
      const cellDate = new Date(firstVisibleDate)
      cellDate.setDate(firstVisibleDate.getDate() + index)
      return {
        date: cellDate,
        dateStr: formatDate(cellDate),
        dayNum: cellDate.getDate(),
        isCurrentMonth: cellDate.getMonth() === month,
      }
    })
  }, [year, month, firstDayOfMonth])

  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }).map((_, index) => calendarCells.slice(index * 7, index * 7 + 7)),
    [calendarCells],
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex justify-center">
      <div className="w-full max-w-md h-screen bg-white flex flex-col shadow-2xl relative overflow-hidden">
        <header className="px-6 pt-8 pb-4 bg-white sticky top-0 z-30">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">근무표</h1>
              <p className="mt-1 text-xs font-bold text-indigo-500">{userName}님, 반갑습니다.</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{userAffiliation}</p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <p className={`text-[10px] font-bold ${firebaseSyncError ? 'text-rose-400' : 'text-emerald-500'}`}>
                {firebaseStatusText}
              </p>
              {activeSection === MAIN_SECTION_ID ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openProfileModal}
                    data-tour-id="tour-profile-button"
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      isProfileComplete
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-600 ring-1 ring-amber-300'
                    }`}
                    aria-label="사용자 정보 등록"
                  >
                    <User size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRegistrationMode && registrationPanel === 'note') {
                        setIsRegistrationMode(false)
                        return
                      }
                      openRegistrationMode('note')
                    }}
                    data-tour-id="tour-note-mode-button"
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      isRegistrationMode && registrationPanel === 'note'
                        ? 'bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                    aria-label="일정 등록 모드"
                  >
                    <CalendarDays size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRegistrationMode && registrationPanel === 'work') {
                        setIsRegistrationMode(false)
                        return
                      }
                      openRegistrationMode('work')
                    }}
                    data-tour-id="tour-work-mode-button"
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg ${
                      isRegistrationMode && registrationPanel === 'work'
                        ? 'bg-rose-500 text-white rotate-45'
                        : 'bg-indigo-600 text-white'
                    }`}
                    aria-label="등록 모드 전환"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center justify-between bg-slate-100 p-1.5 rounded-2xl"
              data-tour-id="tour-month-navigation"
            >
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="p-2 text-slate-600"
                aria-label="이전 달"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="font-black text-slate-700">{monthName}</span>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="p-2 text-slate-600"
                aria-label="다음 달"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleCalendarCapture}
              disabled={isCapturing}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                isCapturing ? 'bg-indigo-100 text-indigo-500 scale-90' : 'bg-slate-100 text-slate-600'
              }`}
              aria-label="달력 캡처 공유"
            >
              <Share2 size={18} />
            </button>
          </div>
        </header>

        <main
          ref={mainScrollRef}
          onScroll={handleMainScroll}
          className={`min-h-0 flex-grow px-4 transition-[padding-bottom] duration-200 overflow-y-auto main-scrollbar ${
            isMainScrolling ? 'is-scrolling' : ''
          }`}
          style={{
            paddingBottom: isRegistrationPopupVisible
              ? `${registrationBottomInset}px`
              : `${MAIN_IDLE_BOTTOM_SPACE}px`,
            scrollPaddingBottom: isRegistrationPopupVisible
              ? `${registrationBottomInset}px`
              : `${MAIN_IDLE_BOTTOM_SPACE}px`,
          }}
        >
          {activeSection === MAIN_SECTION_ID ? (
            <>
              <div
                className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm"
                data-tour-id="tour-calendar-grid"
                onTouchStart={(e) => {
                  calSwipeTouchStartXRef.current = e.touches[0].clientX
                  calSwipeTouchStartYRef.current = e.touches[0].clientY
                }}
                onTouchEnd={(e) => {
                  if (calSwipeTouchStartXRef.current === null) return
                  const dx = e.changedTouches[0].clientX - calSwipeTouchStartXRef.current
                  const dy = e.changedTouches[0].clientY - calSwipeTouchStartYRef.current
                  calSwipeTouchStartXRef.current = null
                  calSwipeTouchStartYRef.current = null
                  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
                  if (dx < 0) setCurrentDate(new Date(year, month + 1, 1))
                  else setCurrentDate(new Date(year, month - 1, 1))
                }}
              >
                <div ref={calendarCaptureRef} style={{ paddingBottom: '8px', backgroundColor: '#ffffff' }}>
                <div className="grid grid-cols-7 border-b border-slate-200">
                  {DAY_LABELS.map((day, index) => (
                    <div
                      key={day}
                      style={{ paddingLeft: `${COLUMN_TEXT_OFFSET_X}px` }}
                      className={`text-left text-[10px] font-black uppercase py-1 ${
                        index === 0
                          ? 'text-rose-400'
                          : index === 6
                            ? 'text-blue-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {calendarWeeks.map((week, weekIndex) => (
                  <div
                    key={`week-${weekIndex}`}
                    className={`grid grid-cols-7 ${weekIndex > 0 ? 'border-t border-slate-300' : ''}`}
                  >
                    {week.map((cell, dayIndex) => {
                      const myType = workTypes.find((type) => type.id === mySchedules[cell.dateStr])
                      const dayHolidayNotes = autoHolidayNotesByDate[cell.dateStr] ?? []
                      const dayNotes = mergeUniqueNotes(dayHolidayNotes, centerDailyNotes[cell.dateStr] ?? [])
                      const activePeriod =
                        centerPeriodSchedules.find((item) =>
                          isDateInRange(cell.dateStr, item.startDate, item.endDate),
                        ) || null
                      const activePeriodIndex = activePeriod
                        ? centerPeriodSchedules.findIndex((item) => item.id === activePeriod.id)
                        : -1
                      const activePeriodStyle = activePeriod
                        ? PERIOD_HIGHLIGHT_STYLES[
                            (activePeriodIndex < 0 ? 0 : activePeriodIndex) % PERIOD_HIGHLIGHT_STYLES.length
                          ]
                        : null
                      const dayHolidayNotesSet = new Set(dayHolidayNotes)
                      const calendarEventsForDay = cell.dateStr ? (calendarEventsByDate[cell.dateStr] ?? []) : []
                      // 기존 노트와 중복되는 캘린더 이벤트 제거
                      // (완전 일치 또는 캘린더 이벤트명이 기존 노트에 부분 포함되는 경우)
                      const existingNotesLower = dayNotes.map((n) => n.toLowerCase())
                      const filteredCalendarEvents = calendarEventsForDay.filter((ev) => {
                        const evLower = ev.toLowerCase()
                        return !existingNotesLower.some(
                          (n) => n === evLower || n.includes(evLower),
                        )
                      })
                      const dayNoteItems = [
                        ...dayNotes.map((note, idx) => ({
                          id: `${cell.dateStr}-note-${idx}`,
                          label: note,
                          isHoliday: dayHolidayNotesSet.has(note),
                          isCalendar: false,
                        })),
                        ...filteredCalendarEvents.map((ev, idx) => ({
                          id: `${cell.dateStr}-cal-${idx}`,
                          label: ev,
                          isHoliday: false,
                          isCalendar: true,
                        })),
                      ]
                      const isSelected = selectedDayStr === cell.dateStr
                      const isToday = cell.dateStr === todayStr

                      const baseDayColor = cell.isCurrentMonth
                        ? dayHolidayNotes.length > 0
                          ? 'text-rose-500'
                          : dayIndex === 0
                            ? 'text-rose-400'
                            : dayIndex === 6
                              ? 'text-blue-400'
                              : 'text-slate-700'
                        : 'text-slate-300'

                      return (
                        <button
                          key={cell.dateStr}
                          ref={(element) => {
                            if (element) {
                              dayCellRefs.current[cell.dateStr] = element
                            } else {
                              delete dayCellRefs.current[cell.dateStr]
                            }
                          }}
                          type="button"
                          onClick={() => {
                            if (isRegistrationMode && !cell.isCurrentMonth) return
                            handleDateClick(cell.dateStr)
                            if (!cell.isCurrentMonth) {
                              setCurrentDate(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1))
                            }
                          }}
                          disabled={isRegistrationMode && !cell.isCurrentMonth}
                          style={{ height: `${CALENDAR_CELL_HEIGHT}px` }}
                          className={`relative px-1 py-1 text-left flex flex-col ${
                            activePeriodStyle ? activePeriodStyle.cell : (isSelected && !isToday) ? 'bg-slate-100' : 'bg-white'
                          } ${
                            (isSelected && !isToday) ? 'outline outline-1 -outline-offset-1 outline-slate-300' : ''
                          } ${
                            isRegistrationMode && !cell.isCurrentMonth
                              ? 'cursor-not-allowed opacity-80'
                              : ''
                          }`}
                        >
                          <div
                            className="relative z-[2] h-[18px] shrink-0 flex items-center"
                            style={{ paddingLeft: `${COLUMN_TEXT_OFFSET_X}px` }}
                          >
                            <span
                              className={`inline-flex items-center justify-center text-[11px] leading-none font-black ${
                                isToday
                                  ? 'w-[18px] h-[18px] rounded-full bg-indigo-600 text-white'
                                  : `h-[18px] px-0 rounded-sm ${baseDayColor}`
                              }`}
                            >
                              {cell.dayNum}
                            </span>
                          </div>

                          <div className="relative z-[2] mt-2 h-6 shrink-0 flex items-center justify-center">
                            {myType ? (
                              <p
                                className={`w-full text-center text-[10px] leading-tight font-black truncate ${
                                  cell.isCurrentMonth ? COLOR_OPTIONS[myType.colorIdx].text : 'text-slate-300'
                                }`}
                              >
                                {myType.label}
                              </p>
                            ) : null}
                          </div>

                          <div className="relative z-[2] mt-auto h-[34px] shrink-0 flex flex-col gap-[2px] pb-[2px]">
                            {dayNoteItems.slice(0, 2).map((item) => {
                              return (
                                <div
                                  key={item.id}
                                  className={`w-full h-[15px] rounded-[2px] border-l-[3px] px-1 flex items-center ${
                                    item.isHoliday
                                      ? 'bg-rose-50 border-rose-400'
                                      : item.isCalendar
                                        ? 'bg-cyan-50 border-cyan-400'
                                        : 'bg-slate-100 border-slate-300'
                                  }`}
                                >
                                  <p className={`text-[9px] leading-none font-bold truncate ${
                                    item.isHoliday
                                      ? 'text-rose-600'
                                      : item.isCalendar
                                        ? 'text-cyan-700'
                                        : 'text-slate-700'
                                  }`}>
                                    {item.label}
                                  </p>
                                </div>
                              )
                            })}
                            {dayNoteItems.length < 2
                              ? Array.from({ length: 2 - dayNoteItems.length }).map((_, idx) => (
                                  <div key={`empty-note-${cell.dateStr}-${idx}`} className="h-[15px]" />
                                ))
                              : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
                </div>{/* calendarCaptureRef 닫기 */}
              </div>

              {isRegistrationMode ? (
                <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3">
                  <MousePointer2 size={16} className="text-amber-500" />
                  <p className="text-[11px] font-black text-amber-700">
                    {selectedDayStr
                      ? '등록 모드: 아래 고정 팝업에서 근무카드를 선택해 등록하세요.'
                      : '등록 모드: 날짜를 누르면 아래 고정 팝업이 열립니다.'}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-3 pb-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-700">
                      즐겨찾기 사용자(총 {favoriteColumnUsers.length}명)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFavoritePickerOpen(true)}
                    disabled={!favoriteCandidates.length}
                    data-tour-id="tour-favorites-user-picker-button"
                    className={`h-9 min-w-[104px] px-3 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1.5 shrink-0 ${
                      favoriteCandidates.length
                        ? 'border-slate-200 bg-white text-slate-600'
                        : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <Users size={14} />
                    사용자 선택
                  </button>
                </div>

                {favoriteColumnUsers.length ? (
                  <p className="mt-2 text-[10px] font-black text-slate-500 truncate">
                    {favoriteColumnUsers.map((user) => user.userName).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] font-bold text-slate-400">
                    선택된 사용자가 없습니다.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-300 overflow-hidden bg-white shadow-sm">
                <div className="relative isolate overflow-x-auto overflow-y-auto max-h-[56vh]">
                  <table className="min-w-full w-max text-[10px] border-separate border-spacing-0">
                    <thead className="sticky top-0 z-40">
                      <tr className="bg-slate-100">
                        <th className="sticky left-0 z-50 w-[54px] min-w-[54px] max-w-[54px] px-0.5 py-2 text-center font-black text-slate-600 border-b border-r border-slate-200 bg-slate-100">
                          날짜
                        </th>
                        {favoriteTableColumns.map((column) => (
                          <th
                            key={`favorite-head-${column.id}`}
                            className="min-w-[62px] px-0.5 py-2 text-center font-black border-b border-slate-200 text-slate-600 bg-slate-100"
                          >
                            {column.userName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {favoriteDateRows.map((row) => {
                        const isSelected = row.dateStr === selectedDayStr
                        return (
                        <tr
                          key={`favorite-row-${row.dateStr}`}
                          className={`cursor-pointer ${isSelected ? 'bg-indigo-100' : 'hover:bg-slate-50'}`}
                          onClick={() => setSelectedDayStr(row.dateStr)}
                        >
                          <td
                            className={`sticky left-0 z-20 w-[54px] min-w-[54px] max-w-[54px] px-0.5 py-2 border-b border-r ${
                              isSelected ? 'bg-indigo-100 border-indigo-200' : 'bg-white border-slate-100'
                            }`}
                          >
                            <div className="mx-auto w-[2.4ch]">
                              {isSelected && (
                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500 rounded-r" />
                              )}
                              <p
                                className={`w-full text-center tabular-nums font-black leading-none ${
                                  isSelected ? 'text-indigo-700' : row.isHoliday || row.isWeekend ? 'text-rose-500' : 'text-slate-700'
                                }`}
                              >
                                {row.dayLabel}
                              </p>
                              <p
                                className={`mt-1 w-full text-center text-[9px] font-bold leading-none ${
                                  isSelected ? 'text-indigo-500' : row.isHoliday || row.isWeekend ? 'text-rose-400' : 'text-slate-400'
                                }`}
                              >
                                {row.weekdayLabel}
                              </p>
                            </div>
                          </td>
                          {favoriteTableColumns.map((column) => {
                            const scheduleTypeId = column.schedules[row.dateStr]
                            const scheduleType = scheduleTypeId ? workTypeMap.get(scheduleTypeId) : null
                            return (
                              <td
                                key={`favorite-cell-${row.dateStr}-${column.id}`}
                                className={`px-0.5 py-2 border-b text-center ${
                                  isSelected ? 'bg-indigo-100 border-indigo-200' : 'bg-white border-slate-100'
                                }`}
                              >
                                <span
                                  className={`text-[10px] font-black leading-none ${
                                    scheduleType
                                      ? COLOR_OPTIONS[scheduleType.colorIdx % COLOR_OPTIONS.length].text
                                      : isSelected ? 'text-indigo-300' : 'text-slate-300'
                                  }`}
                                >
                                  {scheduleType?.label || '-'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] bg-white border-t border-slate-100">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => openSection(MAIN_SECTION_ID)}
              className={`h-11 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 ${
                activeSection === MAIN_SECTION_ID
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Home size={14} />
              메인
            </button>
            <button
              type="button"
              onClick={() => openSection(FAVORITES_SECTION_ID)}
              data-tour-id="tour-favorites-tab-button"
              className={`h-11 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 ${
                activeSection === FAVORITES_SECTION_ID
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Star size={14} className={activeSection === FAVORITES_SECTION_ID ? 'fill-indigo-200' : ''} />
              즐겨찾기
            </button>
          </div>
        </footer>

        {isFavoritePickerOpen && activeSection === FAVORITES_SECTION_ID ? (
          <div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/40 p-0 sm:p-4"
            onClick={() => setIsFavoritePickerOpen(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">즐겨찾기 사용자 선택</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">
                    등록된 사용자 중 보고 싶은 사람을 선택하세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelpModal('favoritesComparison')}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                    aria-label="즐겨찾기 튜토리얼 도움말 열기"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFavoritePickerOpen(false)}
                    className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                    aria-label="즐겨찾기 선택 닫기"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {favoriteCandidates.length ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black text-slate-500">센터 선택</p>
                      <select
                        value={favoritePickerCenterKey}
                        onChange={(event) => setFavoritePickerCenterKey(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-400 bg-white"
                      >
                        {favoriteCenterOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label} ({option.count}명)
                          </option>
                        ))}
                      </select>
                    </div>

                    {favoritePickerUsers.length ? (
                      <div className="space-y-2">
                        {favoritePickerUsers.map((user) => {
                          const isSelected = favoriteUserKeys.includes(user.id)
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => toggleFavoriteUser(user.id)}
                              className={`w-full rounded-xl border px-3 py-2.5 flex items-center gap-2 ${
                                isSelected
                                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                  isSelected ? 'border-amber-300 bg-amber-100' : 'border-slate-200 bg-white'
                                }`}
                              >
                                {isSelected ? <Check size={12} /> : null}
                              </span>
                              <span className="text-xs font-black truncate">{user.userName}</span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs font-black text-slate-400">
                        선택한 센터에 등록된 사용자가 없습니다.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-black text-slate-400">
                    아직 등록된 다른 사용자 정보가 없습니다.
                  </p>
                )}
              </div>

              <div className="p-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFavoritePickerOpen(false)}
                  className="w-full py-3 bg-slate-900 text-white font-black rounded-xl text-xs"
                >
                  완료
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isRegistrationPopupVisible ? (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none">
            <div
              ref={registrationPopupRef}
              data-tour-id="tour-registration-popup"
              className="w-full max-w-md bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.12)] border-t border-slate-100 pointer-events-auto animate-sheet"
            >
              <div className="flex justify-center py-3">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
              </div>

              <div className="px-6 pb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <ArrowRightCircle size={18} className="text-indigo-600" />
                    {selectedDayLabel} 등록
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openHelpModal(
                          registrationPanel === 'work' ? 'workRegistrationMode' : 'scheduleRegistrationMode',
                        )
                      }
                      className="w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                      aria-label={
                        registrationPanel === 'work'
                          ? '근무 등록 튜토리얼 도움말 열기'
                          : '일정/기간 등록 튜토리얼 도움말 열기'
                      }
                    >
                      ?
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRegistrationMode(false)}
                      className="text-slate-400 font-bold text-sm"
                    >
                      닫기
                    </button>
                  </div>
                </div>

                {registrationPanel === 'work' ? (
                  <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="rounded-2xl border border-slate-100 p-3 bg-slate-50/40">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-slate-600">근무형태 선택</p>
                        <span className="text-[10px] font-bold text-slate-400">{registrationWorkTypes.length}개</span>
                      </div>

                      {!selectedDayStr ? (
                        <p className="mt-2 text-[10px] text-slate-400 font-bold">
                          날짜를 누르면 아래에 근무형태가 표시됩니다.
                        </p>
                      ) : !registrationCenter || !isRegistrationDispatchValid ? (
                        <p className="mt-2 text-[10px] text-rose-500 font-black">
                          사용자 정보에서 센터/근무지를 먼저 선택해 주세요.
                        </p>
                      ) : registrationWorkTypes.length ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-[10px] font-bold text-indigo-500">
                            적용: {registrationCenter.name} / {registrationDispatchLabel}
                          </p>
                          <div className="grid grid-cols-5 gap-2">
                            <button
                              type="button"
                              onClick={() => requestApplyWork(null)}
                              className={`h-14 rounded-md border text-white text-[10px] font-black transition-all ${
                                selectedTypeId === null
                                  ? 'bg-slate-500 border-slate-500'
                                  : 'bg-slate-400 border-slate-300'
                              }`}
                            >
                              삭제
                            </button>
                            {registrationWorkTypes.map((type) => (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() => requestApplyWork(type.id)}
                                className={`h-14 flex flex-col items-center justify-center gap-1 p-1 rounded-md border transition-all ${
                                  selectedTypeId === type.id
                                    ? `${COLOR_OPTIONS[type.colorIdx].bg} ${COLOR_OPTIONS[type.colorIdx].border}`
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div
                                  className={`w-2.5 h-2.5 rounded-full ${COLOR_OPTIONS[type.colorIdx].dotBg} border ${COLOR_OPTIONS[type.colorIdx].dotBorder}`}
                                />
                                <span className="text-[10px] font-black text-slate-700 truncate w-full text-center">
                                  {type.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-400 font-bold">등록된 근무형태가 없습니다.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegistrationMode(false)
                          openCenterManageModal('workType')
                        }}
                        data-tour-id="tour-center-settings-button"
                        className="py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-black"
                      >
                        센터 설정
                      </button>
                      <button
                        type="button"
                        onClick={openWorkTypeModal}
                        data-tour-id="tour-worktype-manage-button"
                        className="py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-black"
                      >
                        근무형태
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRegistrationMode(false)}
                        className="py-3 rounded-xl bg-white border border-rose-200 text-rose-500 text-sm font-black"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="rounded-2xl border border-slate-100 p-3 bg-slate-50/40">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-slate-600">추가 일정</p>
                        <span className="text-[10px] font-bold text-slate-400">
                          {selectedDayAutoHolidayNotes.length + selectedDayManualNotes.length + selectedDayCalendarEvents.length}건
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">선택일: {selectedDayLabel}</p>

                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={dayNoteInput}
                          onChange={(event) => {
                            setDayNoteInput(event.target.value)
                            if (dayNoteError) setDayNoteError('')
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') addDayNote()
                          }}
                          placeholder="예: 15:00 팀 미팅"
                          disabled={!selectedDayStr}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-400 bg-white disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={addDayNote}
                          disabled={!selectedDayStr}
                          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40"
                        >
                          등록
                        </button>
                      </div>

                      {dayNoteError ? (
                        <p className="mt-2 text-[10px] font-black text-rose-500">{dayNoteError}</p>
                      ) : null}

                      {selectedDayAutoHolidayNotes.length || selectedDayManualNotes.length || selectedDayCalendarEvents.length ? (
                        <div className="mt-2 space-y-1.5">
                          {selectedDayAutoHolidayNotes.map((note, idx) => (
                            <div
                              key={`${selectedDayStr}-holiday-${idx}`}
                              className="rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-2 flex items-center gap-2"
                            >
                              <p className="flex-1 min-w-0 text-[10px] font-black text-rose-500 truncate">{note}</p>
                              <span className="text-[9px] font-black text-rose-400">자동</span>
                            </div>
                          ))}
                          {selectedDayManualNoteEntries.map((note) => (
                            <div
                              key={note.id}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 flex items-center gap-2"
                            >
                              <p className="flex-1 min-w-0 text-[10px] font-black text-slate-600 truncate">
                                {note.text}
                              </p>
                              <span className="text-[9px] font-black text-slate-400 shrink-0">당일 일정</span>
                              <button
                                type="button"
                                onClick={() => removeDayNote(note.id)}
                                className="text-[10px] font-black text-rose-500 shrink-0"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                          {selectedDayCalendarEvents.map((ev, idx) => (
                            <div
                              key={`${selectedDayStr}-calendar-${idx}`}
                              className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-2.5 py-2 flex items-center gap-2"
                            >
                              <p className="flex-1 min-w-0 text-[10px] font-black text-cyan-700 truncate">{ev}</p>
                              <span className="text-[9px] font-black text-cyan-500">캘린더</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-400 font-bold">등록된 추가 일정이 없습니다.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-100 p-3 bg-slate-50/40">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-slate-600">기간 일정</p>
                        <span className="text-[10px] font-bold text-slate-400">
                          선택일 적용 {selectedDayPeriodSchedules.length}건
                        </span>
                      </div>

                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={periodLabelInput}
                          onChange={(event) => {
                            setPeriodLabelInput(event.target.value)
                            if (periodFormError) setPeriodFormError('')
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') addPeriodSchedule()
                          }}
                          placeholder="예: 교육기간, 점검기간"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-400 bg-white"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <label className="relative block">
                            <input
                              type="date"
                              value={periodStartInput}
                              onChange={(event) => {
                                setPeriodStartInput(event.target.value)
                                if (periodFormError) setPeriodFormError('')
                              }}
                              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                              aria-label="기간 일정 시작일"
                            />
                            <div className="h-full rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-700 bg-white flex items-center justify-between gap-2">
                              <span className="min-w-0 tabular-nums whitespace-nowrap">
                                {formatDatePickerLabel(periodStartInput)}
                              </span>
                              <ChevronRight size={14} className="shrink-0 rotate-90 text-slate-500" />
                            </div>
                          </label>
                          <label className="relative block">
                            <input
                              type="date"
                              value={periodEndInput}
                              onChange={(event) => {
                                setPeriodEndInput(event.target.value)
                                if (periodFormError) setPeriodFormError('')
                              }}
                              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                              aria-label="기간 일정 종료일"
                            />
                            <div className="h-full rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-700 bg-white flex items-center justify-between gap-2">
                              <span className="min-w-0 tabular-nums whitespace-nowrap">
                                {formatDatePickerLabel(periodEndInput)}
                              </span>
                              <ChevronRight size={14} className="shrink-0 rotate-90 text-slate-500" />
                            </div>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={addPeriodSchedule}
                          className="w-full px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black"
                        >
                          기간 일정 등록
                        </button>
                      </div>

                      {periodFormError ? (
                        <p className="mt-2 text-[10px] font-black text-rose-500">{periodFormError}</p>
                      ) : null}

                      {centerPeriodSchedules.length ? (
                        <div className="mt-2 space-y-1.5">
                          {centerPeriodSchedules.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 flex items-center gap-2"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-slate-700 truncate">{item.label}</p>
                                <p className="text-[9px] font-bold text-slate-400">
                                  {item.startDate} ~ {item.endDate}
                                </p>
                              </div>
                              <span className="text-[9px] font-black text-indigo-400 shrink-0">기간 일정</span>
                              <button
                                type="button"
                                onClick={() => removePeriodSchedule(item.id)}
                                className="text-[10px] font-black text-rose-500 shrink-0"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-400 font-bold">등록된 기간 일정이 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isStatusModalOpen ? (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 sm:p-4">
            <div
              data-tour-id="tour-status-modal-panel"
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">상세 근무 현황</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">{selectedDayLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelpModal('workStatusCheck')}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                    aria-label="근무 확인 튜토리얼 도움말 열기"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(false)}
                    className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                    aria-label="모달 닫기"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-6">
                <div className="rounded-2xl border border-slate-100 p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-slate-600">해당일 일정</p>
                    <span className="text-[10px] font-bold text-slate-400">
                      {selectedDayScheduleItems.length}건
                    </span>
                  </div>

                  {selectedDayScheduleItems.length ? (
                    <div className="mt-2 space-y-1.5">
                      {selectedDayScheduleItems.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border px-2.5 py-2 flex items-start gap-2 ${
                            item.kind === 'holiday'
                              ? 'border-rose-200 bg-rose-50'
                              : item.kind === 'calendar'
                                ? 'border-cyan-100 bg-cyan-50/40'
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          <span
                            className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                              item.kind === 'holiday'
                                ? 'bg-rose-400'
                                : item.kind === 'period'
                                  ? 'bg-emerald-300'
                                  : item.kind === 'calendar'
                                    ? 'bg-cyan-400'
                                    : 'bg-slate-300'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`text-[10px] font-black truncate ${
                              item.kind === 'holiday' ? 'text-rose-700' : item.kind === 'calendar' ? 'text-cyan-700' : 'text-slate-700'
                            }`}>{item.label}</p>
                            <p className={`text-[9px] font-bold truncate ${
                              item.kind === 'holiday' ? 'text-rose-400' : item.kind === 'calendar' ? 'text-cyan-400' : 'text-slate-400'
                            }`}>{item.meta}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] font-bold text-slate-400">선택일에 등록된 일정이 없습니다.</p>
                  )}
                </div>

                {workTypesByCenter.map((centerGroup) => {
                  if (!centerGroup.types.length) return null

                  const centerDispatchSites = dispatchSites.filter(
                    (site) => site.centerId === centerGroup.id,
                  )
                  const dispatchLabelMap = new Map([
                    [CENTER_DISPATCH_SITE_ID, '센터'],
                    ...centerDispatchSites.map((site) => [site.id, getDispatchLabelText(site.name)]),
                  ])
                  const groupedByDispatch = centerGroup.types.reduce((acc, type) => {
                    const dispatchId = type.dispatchSiteId || CENTER_DISPATCH_SITE_ID
                    if (!acc[dispatchId]) acc[dispatchId] = []
                    acc[dispatchId].push(type)
                    return acc
                  }, {})
                  const centerDispatchIds = centerDispatchSites.map((site) => site.id)
                  const orderedDispatchIds = [
                    CENTER_DISPATCH_SITE_ID,
                    ...centerDispatchIds,
                    ...Object.keys(groupedByDispatch).filter(
                      (dispatchId) =>
                        dispatchId !== CENTER_DISPATCH_SITE_ID && !centerDispatchIds.includes(dispatchId),
                    ),
                  ].filter((dispatchId) => (groupedByDispatch[dispatchId] || []).length > 0)

                  return (
                    <div key={centerGroup.id} className="space-y-3">
                      <h4 className="text-xs font-black text-slate-500 border-b border-slate-100 pb-1">
                        {centerGroup.name}
                      </h4>

                      <div className="space-y-3">
                        {orderedDispatchIds.map((dispatchId) => {
                          const dispatchTypes = groupedByDispatch[dispatchId] || []
                          const dispatchLabel = dispatchLabelMap.get(dispatchId) || '기타'
                          const placeholderCount = (5 - (dispatchTypes.length % 5)) % 5

                          return (
                            <div key={`${centerGroup.id}-${dispatchId}`} className="space-y-1.5">
                              <p className="text-[11px] font-black text-slate-500">{dispatchLabel}</p>
                              <div className="bg-white overflow-hidden">
                                <div className="grid grid-cols-5 gap-0">
                                  {dispatchTypes.map((type) => {
                                    const workers = statusWorkersByType[type.id] ?? []
                                    const workerNames = workers.map((worker) => worker.name).join(', ')

                                    return (
                                      <div key={type.id} className="border border-slate-200">
                                        <p
                                          className={`px-1.5 py-1.5 text-[10px] font-black text-center bg-slate-100 border-b border-slate-200 break-all ${COLOR_OPTIONS[type.colorIdx].text}`}
                                        >
                                          {type.label}
                                        </p>
                                        <p className="px-1.5 py-1.5 min-h-[32px] flex items-center justify-center text-[10px] font-bold text-slate-500 text-center leading-4 break-words bg-white">
                                          {workerNames || '-'}
                                        </p>
                                      </div>
                                    )
                                  })}
                                  {Array.from({ length: placeholderCount }).map((_, idx) => (
                                    <div
                                      key={`${centerGroup.id}-${dispatchId}-empty-${idx}`}
                                      className="border border-white bg-white"
                                    >
                                      <div className="px-1.5 py-1.5 bg-white border-b border-white min-h-[24px]" />
                                      <div className="px-1.5 py-1.5 min-h-[32px] bg-white" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsStatusModalOpen(false)
                    setRegistrationPanel('work')
                    setIsRegistrationMode(true)
                  }}
                  className="flex-1 py-4 bg-indigo-50 text-indigo-600 font-black rounded-2xl text-xs"
                >
                  내 근무 수정
                </button>
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl text-xs shadow-lg"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {updateInfo ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 px-6">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 pt-6 pb-5">
                <p className="text-base font-bold text-slate-800 mb-1">새 버전이 있습니다</p>
                <p className="text-sm text-slate-500">v{updateInfo.version} 업데이트가 준비됐습니다.</p>
              </div>
              <div className="flex border-t border-slate-100">
                <button
                  className="flex-1 py-3.5 text-sm text-slate-400 font-medium"
                  onClick={() => setUpdateInfo(null)}
                >
                  나중에
                </button>
                <button
                  className="flex-1 py-3.5 text-sm text-indigo-600 font-bold border-l border-slate-100"
                  onClick={() => { location.href = updateInfo.downloadUrl; setUpdateInfo(null) }}
                >
                  업데이트
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {shouldShowProfileModal ? (
          <div
            className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-900/40 p-0 sm:p-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div
              data-tour-id="tour-profile-modal-panel"
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">사용자 정보 등록</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">
                    이름, 센터, 근무지를 선택해 주세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelpModal('profileRegistration')}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                    aria-label="사용자 정보 등록 튜토리얼 도움말 열기"
                  >
                    ?
                  </button>
                  {isProfileComplete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileModalOpen(false)
                        setProfileFormError('')
                      }}
                      className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                      aria-label="사용자 정보 모달 닫기"
                    >
                      <X size={24} />
                    </button>
                  ) : (
                    <div className="w-10 h-10" />
                  )}
                </div>
              </div>

              <div
                className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
              >
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">이름</p>
                  <input
                    type="text"
                    value={profileNameInput}
                    onChange={(event) => {
                      setProfileNameInput(event.target.value)
                      if (profileFormError) setProfileFormError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveProfile()
                    }}
                    placeholder="예: 홍길동"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">센터</p>
                  <select
                    value={profileCenterIdInput}
                    onChange={(event) => {
                      setProfileCenterIdInput(event.target.value)
                      if (profileFormError) setProfileFormError('')
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="" disabled>
                      센터를 선택하세요
                    </option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">근무지</p>
                  <select
                    value={profileDispatchSiteIdInput}
                    onChange={(event) => {
                      setProfileDispatchSiteIdInput(event.target.value)
                      if (profileFormError) setProfileFormError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveProfile()
                    }}
                    disabled={!profileCenterIdInput}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 bg-white disabled:opacity-50"
                  >
                    {profileDispatchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {profileFormError ? (
                  <p className="text-xs font-black text-rose-500">{profileFormError}</p>
                ) : null}

                <button
                  type="button"
                  onClick={saveProfile}
                  className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl text-xs"
                >
                  사용자 정보 저장
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeManageModal === 'centerManage' ? (
          <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/55 p-0 sm:p-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div
              data-tour-id="tour-center-manage-modal-panel"
              className="relative z-10 w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">센터 설정</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">센터 추가 / 수정 / 삭제</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelpModal('centerDispatchSettings')}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                    aria-label="센터/근무지 설정 튜토리얼 도움말 열기"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={closeCenterManageModal}
                    className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                    aria-label="센터 설정 모달 닫기"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div
                className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
              >
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">센터 추가</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={centerNameInput}
                      onChange={(event) => {
                        setCenterNameInput(event.target.value)
                        if (centerFormError) setCenterFormError('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addCenter()
                      }}
                      placeholder="예: 해남센터"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={addCenter}
                      className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                    >
                      추가
                    </button>
                  </div>
                </div>

                {centerFormError ? (
                  <p className="text-xs font-black text-rose-500">{centerFormError}</p>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">등록된 센터 ({centers.length})</p>

                  {centers.map((center) => {
                    const isEditing = editingCenterId === center.id
                    const workTypeCount = workTypes.filter((type) => type.centerId === center.id).length
                    const dispatchCount = dispatchSites.filter((site) => site.centerId === center.id).length

                    return (
                      <div
                        key={center.id}
                        className={`rounded-xl border p-2 ${
                          selectedCenterId === center.id
                            ? 'border-indigo-200 bg-indigo-50/40'
                            : 'border-slate-100 bg-white'
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={centerEditInput}
                              onChange={(event) => {
                                setCenterEditInput(event.target.value)
                                if (centerFormError) setCenterFormError('')
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') saveCenterEdit()
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-400"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={saveCenterEdit}
                                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center gap-1"
                              >
                                <Check size={12} />
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCenterId(null)
                                  setCenterEditInput('')
                                  setCenterFormError('')
                                }}
                                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-black"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black text-slate-700 truncate">{center.name}</p>
                              <p className="text-[10px] font-bold text-slate-400">
                                근무형태 {workTypeCount}개 / 근무지 {dispatchCount}개
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => startEditCenter(center)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"
                              aria-label={`${center.name} 수정`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCenter(center.id)}
                              disabled={centers.length <= 1}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                              aria-label={`${center.name} 삭제`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-black text-slate-500">근무지 설정</p>
                  <select
                    value={selectedCenterId}
                    onChange={(event) => {
                      setSelectedCenterId(event.target.value)
                      if (dispatchFormError) setDispatchFormError('')
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 bg-white"
                  >
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dispatchSiteInput}
                      onChange={(event) => {
                        setDispatchSiteInput(event.target.value)
                        if (dispatchFormError) setDispatchFormError('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addDispatchSite()
                      }}
                      placeholder="예: 진도"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={addDispatchSite}
                      className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                    >
                      추가
                    </button>
                  </div>

                  {dispatchFormError ? (
                    <p className="text-xs font-black text-rose-500">{dispatchFormError}</p>
                  ) : null}

                  <div className="rounded-xl border border-slate-100 p-2.5 bg-white space-y-2">
                    <p className="text-[10px] font-bold text-slate-400">
                      {selectedCenter ? `${selectedCenter.name} 근무지 ${selectedCenterDispatchSites.length}개` : '-'}
                    </p>

                    {selectedCenterDispatchSites.map((site) => {
                      const isEditing = editingDispatchSiteId === site.id

                      return (
                        <div key={site.id} className="rounded-lg border border-slate-100 p-2">
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={dispatchEditInput}
                                onChange={(event) => {
                                  setDispatchEditInput(event.target.value)
                                  if (dispatchFormError) setDispatchFormError('')
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') saveDispatchSiteEdit()
                                }}
                                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black text-slate-700 outline-none focus:border-indigo-400"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={saveDispatchSiteEdit}
                                  className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center gap-1"
                                >
                                  <Check size={12} />
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDispatchSiteId(null)
                                    setDispatchEditInput('')
                                    setDispatchFormError('')
                                  }}
                                  className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-black"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="flex-1 min-w-0 text-xs font-black text-slate-700 truncate">{site.name}</p>
                              <button
                                type="button"
                                onClick={() => startEditDispatchSite(site)}
                                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"
                                aria-label={`${site.name} 수정`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeDispatchSite(site.id)}
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center"
                                aria-label={`${site.name} 삭제`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {!selectedCenterDispatchSites.length ? (
                      <p className="text-[10px] text-slate-300 font-black text-center py-2">
                        등록된 근무지가 없습니다.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeManageModal === 'workType' ? (
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/40 p-0 sm:p-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div
              data-tour-id="tour-worktype-manage-modal-panel"
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">센터/근무형태 관리</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">센터별 묶음 등록/수정/삭제</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHelpModal('workTypeManagement')}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 text-sm font-black"
                    aria-label="근무형태 관리 튜토리얼 도움말 열기"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveManageModal(null)
                      resetWorkTypeForm()
                    }}
                    className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                    aria-label="근무형태 모달 닫기"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div
                className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-500">센터 선택</p>
                    <button
                      type="button"
                      onClick={openCenterManageModal}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500"
                      aria-label="센터 설정 열기"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                  <select
                    value={selectedCenterId}
                    onChange={(event) => {
                      setSelectedCenterId(event.target.value)
                      setTypeCenterIdInput(event.target.value)
                      setTypeDispatchSiteIdInput(CENTER_DISPATCH_SITE_ID)
                      if (!editingTypeId) {
                        setTypeFormError('')
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 bg-white"
                  >
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-500">근무형태 등록/수정</p>

                  <select
                    value={typeDispatchSiteIdInput}
                    onChange={(event) => setTypeDispatchSiteIdInput(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 bg-white"
                  >
                    {selectedCenterDispatchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={typeLabelInput}
                    onChange={(event) => {
                      setTypeLabelInput(event.target.value)
                      if (typeFormError) setTypeFormError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveWorkType()
                    }}
                    placeholder="근무형태 이름"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400"
                  />
                </div>

                <div>
                  <p className="text-xs font-black text-slate-500">색상 선택</p>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {COLOR_OPTIONS.map((color, idx) => (
                      <button
                        key={`color-${idx}`}
                        type="button"
                        onClick={() => setTypeColorIdxInput(idx)}
                        className={`h-9 rounded-lg border-2 flex items-center justify-center ${
                          typeColorIdxInput === idx
                            ? 'border-indigo-500 ring-1 ring-indigo-200'
                            : 'border-slate-100'
                        }`}
                        aria-label={`색상 ${idx + 1}`}
                      >
                        <span className={`w-4 h-4 rounded-full ${color.dotBg} border ${color.dotBorder}`} />
                      </button>
                    ))}
                  </div>
                </div>

                {typeFormError ? (
                  <p className="text-xs font-black text-rose-500">{typeFormError}</p>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveWorkType}
                    className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1"
                  >
                    <Check size={14} />
                    {editingTypeId ? '수정 저장' : '근무형태 등록'}
                  </button>

                  {editingTypeId ? (
                    <button
                      type="button"
                      onClick={resetWorkTypeForm}
                      className="px-4 py-3 bg-slate-100 text-slate-600 font-black rounded-xl text-xs"
                    >
                      새로 등록
                    </button>
                  ) : null}
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <p className="text-xs font-black text-slate-500">
                    {selectedCenter ? `${selectedCenter.name} / ${selectedDispatchLabel} 근무형태 목록` : '근무형태 목록'}
                  </p>

                  <div className="rounded-xl border border-slate-100 p-2.5 bg-white">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <p className="text-xs font-black text-slate-600">
                        {selectedCenter?.name} / {selectedDispatchLabel}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">{filteredSelectedCenterWorkTypes.length}개</p>
                    </div>

                    <div
                      className={`mt-2 space-y-1.5 ${draggingOrderTypeId ? 'select-none touch-none' : ''}`}
                      onPointerMove={handleOrderPointerMove}
                    >
                      <div className="grid grid-cols-[68px_minmax(0,1fr)_40px_40px] gap-2 px-2 py-1 text-[10px] font-black text-slate-400">
                        <p className="text-center">순서</p>
                        <p>근무형태</p>
                        <p className="text-center">수정</p>
                        <p className="text-center">삭제</p>
                      </div>

                      {filteredSelectedCenterWorkTypes.map((type) => {
                        const typeColor = COLOR_OPTIONS[type.colorIdx % COLOR_OPTIONS.length] || COLOR_OPTIONS[0]
                        return (
                          <div
                            key={type.id}
                            data-order-type-id={type.id}
                            className={`grid grid-cols-[68px_minmax(0,1fr)_40px_40px] items-center gap-2 rounded-xl border p-2 ${
                              draggingOrderTypeId === type.id
                                ? 'border-indigo-300 bg-indigo-100/60'
                                : pressedOrderTypeId === type.id
                                  ? 'border-indigo-200 bg-indigo-50/70'
                                  : editingTypeId === type.id
                                    ? 'border-indigo-200 bg-indigo-50/70'
                                    : 'border-slate-100 bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              onPointerDown={(event) => startOrderLongPress(event, type.id)}
                              onPointerUp={clearWorkTypeReorderTimer}
                              onPointerCancel={clearWorkTypeReorderTimer}
                              onPointerLeave={() => {
                                if (!draggingOrderTypeId) clearWorkTypeReorderTimer()
                              }}
                              className={`h-8 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1 ${
                                draggingOrderTypeId === type.id || pressedOrderTypeId === type.id
                                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                              }`}
                              aria-label={`${type.label} 순서 이동`}
                            >
                              <GripVertical size={12} />
                              <span>
                                {filteredSelectedCenterWorkTypes.findIndex((item) => item.id === type.id) + 1}
                              </span>
                            </button>

                            <div className="min-w-0 flex items-center gap-1.5">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full ${typeColor.dotBg}`}
                                aria-hidden="true"
                              />
                              <p className={`text-xs font-black truncate ${typeColor.text}`}>{type.label}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => startEditWorkType(type)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center justify-self-center"
                              aria-label={`${type.label} 수정`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => requestRemoveWorkType(type.id)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center justify-self-center"
                              aria-label={`${type.label} 삭제`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )
                      })}

                      {draggingOrderTypeId ? (
                        <p className="pt-1 text-[10px] font-black text-indigo-500 text-center">
                          순서 칸을 길게 누른 상태로 위/아래로 이동하면 순서가 변경됩니다.
                        </p>
                      ) : null}

                      {!filteredSelectedCenterWorkTypes.length ? (
                        <p className="py-2 text-center text-[10px] text-slate-300 font-black">
                          선택 근무지에 등록된 근무형태가 없습니다.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeHelpTopic ? (
          <div
            className="fixed inset-0 z-[400] flex items-end justify-center bg-slate-900/45 p-0 sm:p-4"
            onClick={closeHelpModal}
          >
            <div
              className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{activeHelpTopic.title}</h3>
                  <p className="text-xs font-bold text-indigo-500 mt-1">튜토리얼 도움말</p>
                </div>
                <button
                  type="button"
                  onClick={closeHelpModal}
                  className="p-2 text-slate-400 bg-white rounded-xl shadow-sm"
                  aria-label="도움말 닫기"
                >
                  <X size={24} />
                </button>
              </div>

              <div
                className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-3"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
              >
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                  <p className="text-xs font-black text-indigo-600">{activeHelpTopic.description}</p>
                </div>

                {activeHelpTopic.highlight ? (
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-xs font-black text-slate-600">안내</p>
                    <p className="mt-2 text-[11px] font-black text-indigo-500 leading-5">
                      {activeHelpTopic.highlight}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-100 bg-white p-3">
                  <p className="text-xs font-black text-slate-600">기능</p>
                  <ul className="mt-2 space-y-1.5">
                    {activeHelpTopic.points.map((item, index) => (
                      <li key={`help-point-${index}`} className="text-[11px] font-bold text-slate-500">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {activeHelpTopic.caution ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                    <p className="text-xs font-black text-amber-600">주의사항</p>
                    <p className="mt-2 text-[11px] font-bold text-amber-700 leading-5">
                      • {activeHelpTopic.caution}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isSpotlightTutorialOpen && activeSpotlightStep ? (
          <div className="fixed inset-0 z-[520]">
            {spotlightHoleRects.length ? (
              <svg className="pointer-events-none fixed inset-0 w-full h-full" aria-hidden="true">
                <defs>
                  <mask id={SPOTLIGHT_OVERLAY_MASK_ID}>
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    {spotlightHoleRects.map((rect, index) => (
                      <rect
                        key={`spotlight-hole-${index}`}
                        x={rect.left}
                        y={rect.top}
                        width={rect.width}
                        height={rect.height}
                        rx="16"
                        ry="16"
                        fill="black"
                      />
                    ))}
                  </mask>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill="rgba(15,23,42,0.62)"
                  mask={`url(#${SPOTLIGHT_OVERLAY_MASK_ID})`}
                />
              </svg>
            ) : (
              <div className="pointer-events-none fixed inset-0 bg-slate-900/62" />
            )}
            {spotlightTargetRect ? (
              <div
                className="pointer-events-none fixed border-2 border-indigo-300 rounded-2xl"
                style={{
                  left: `${spotlightTargetRect.left}px`,
                  top: `${spotlightTargetRect.top}px`,
                  width: `${spotlightTargetRect.width}px`,
                  height: `${spotlightTargetRect.height}px`,
                  transition: 'left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease',
                }}
              />
            ) : null}
            {spotlightSecondaryTargetRect ? (
              <div
                className="pointer-events-none fixed border-2 border-indigo-300 rounded-2xl"
                style={{
                  left: `${spotlightSecondaryTargetRect.left}px`,
                  top: `${spotlightSecondaryTargetRect.top}px`,
                  width: `${spotlightSecondaryTargetRect.width}px`,
                  height: `${spotlightSecondaryTargetRect.height}px`,
                  boxShadow: '0 0 0 2px rgba(129,140,248,0.28)',
                  transition: 'left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease',
                }}
              />
            ) : null}

            <div
              className="pointer-events-auto fixed left-4 z-[530]"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
            >
              <button
                type="button"
                onClick={exitOnboardingPreviewMode}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-black text-slate-500 shadow-sm"
              >
                건너뛰기
              </button>
            </div>

            <div
              ref={spotlightCardRef}
              className="pointer-events-auto fixed inset-x-4 mx-auto w-auto max-w-md"
              style={
                spotlightCardTop === null
                  ? { bottom: `calc(env(safe-area-inset-bottom, 0px) + ${SPOTLIGHT_CARD_BOTTOM_SAFE_GAP}px)` }
                  : { top: `${spotlightCardTop}px` }
              }
            >
              <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <SpotlightIcon size={15} />
                  </span>
                  <p className="text-sm font-black text-slate-800 truncate">{activeSpotlightStep.title}</p>
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-500 leading-5">
                  {activeSpotlightStep.description}
                </p>
                {activeSpotlightStep.highlight ? (
                  <p className="mt-1 text-[10px] font-black text-indigo-500">{activeSpotlightStep.highlight}</p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeSpotlightStep.points.map((point, index) => (
                    <span
                      key={`${activeSpotlightStep.id}-point-chip-${index}`}
                      className="px-2 py-1 rounded-full bg-slate-100 text-[10px] font-black text-slate-500"
                    >
                      {point}
                    </span>
                  ))}
                </div>

                {activeSpotlightStep.caution ? (
                  <p className="mt-2 text-[10px] font-black text-amber-600">
                    주의: {activeSpotlightStep.caution}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-start">
                  <div className="flex items-center gap-1">
                    {ONBOARDING_SPOTLIGHT_STEPS.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setSpotlightStepIndex(index)}
                        className={`h-2 rounded-full transition-all ${
                          index === safeSpotlightStepIndex ? 'w-5 bg-indigo-500' : 'w-2 bg-slate-300'
                        }`}
                        aria-label={`${index + 1}단계로 이동`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="pointer-events-auto fixed left-4 z-[530] flex items-center gap-2"
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
            >
              <button
                type="button"
                onClick={() => moveSpotlightStep(-1)}
                disabled={safeSpotlightStepIndex === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-black text-slate-500 shadow-sm disabled:opacity-40"
              >
                이전
              </button>
              {safeSpotlightStepIndex === totalSpotlightSteps - 1 ? (
                <button
                  type="button"
                  onClick={exitOnboardingPreviewMode}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-[11px] font-black text-white shadow-sm"
                >
                  시작하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => moveSpotlightStep(1)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-[11px] font-black text-white shadow-sm"
                >
                  다음
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
