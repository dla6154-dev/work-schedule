// Supabase Edge Function: sync-holidays
// Deploy: supabase functions deploy sync-holidays
// Move this file to: supabase/functions/sync-holidays/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOLIDAY_API_ENDPOINT =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'
const HOLIDAY_API_KEY = Deno.env.get('REST_HOLIDAY_SERVICE_KEY') || ''
const WORKSPACE_ID = Deno.env.get('WORKSPACE_ID') || 'default'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const SYNC_TIME_ZONE = 'Asia/Seoul'
const MONTHS = Array.from({ length: 12 }).map((_, i) => i + 1)
const YEAR_PATTERN = /^\d{4}$/
const STAMP_PATTERN = /^\d{4}-\d{2}$/
const TABLE = 'work_widget_states'

const getKstYearMonth = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYNC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value || '0')
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  return { year, stamp: `${year}-${month}` }
}

const parseLocDateToYmd = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8)
  if (digits.length !== 8) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

const isHolidayFlag = (value) => {
  const n = String(value ?? '').trim().toUpperCase()
  return n === 'Y' || n === '1' || n === 'TRUE'
}

const normalizeHolidayNotes = (raw) =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.entries(raw).reduce((acc, [dateStr, labels]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Array.isArray(labels)) return acc
        const nl = []
        labels.forEach((l) => {
          if (typeof l !== 'string') return
          const t = l.trim()
          if (t && !nl.includes(t)) nl.push(t)
        })
        if (nl.length) acc[dateStr] = nl
        return acc
      }, {})
    : {}

const normalizeHolidaySyncByYear = (raw) =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.entries(raw).reduce((acc, [year, stamp]) => {
        if (!YEAR_PATTERN.test(year)) return acc
        if (typeof stamp !== 'string' || !STAMP_PATTERN.test(stamp)) return acc
        acc[year] = stamp
        return acc
      }, {})
    : {}

const mergeHolidayNotesForYear = (prevMap, yearKey, yearHolidayMap) => {
  const next = { ...prevMap }
  const prefix = `${yearKey}-`
  Object.keys(next).forEach((d) => { if (d.startsWith(prefix)) delete next[d] })
  Object.entries(yearHolidayMap).forEach(([d, labels]) => {
    if (!d.startsWith(prefix) || !Array.isArray(labels) || !labels.length) return
    next[d] = [...labels]
  })
  return next
}

const getXmlTagText = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

const parseHolidayItemsFromJson = (payload) => {
  const raw = payload?.response?.body?.items?.item
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  return items
    .map((item) => ({
      dateStr: parseLocDateToYmd(item?.locdate),
      label: typeof item?.dateName === 'string' ? item.dateName.trim() : '',
      isHoliday: isHolidayFlag(item?.isHoliday),
    }))
    .filter((item) => item.dateStr && item.label && item.isHoliday)
}

const parseHolidayItemsFromXml = (rawXml) => {
  if (!rawXml || typeof rawXml !== 'string') return []
  return Array.from(rawXml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
    .map((m) => m[1])
    .map((block) => ({
      dateStr: parseLocDateToYmd(getXmlTagText(block, 'locdate')),
      label: getXmlTagText(block, 'dateName'),
      isHoliday: isHolidayFlag(getXmlTagText(block, 'isHoliday')),
    }))
    .filter((item) => item.dateStr && item.label && item.isHoliday)
}

const fetchHolidayItemsByMonth = async (year, month) => {
  const params = new URLSearchParams({
    serviceKey: HOLIDAY_API_KEY,
    solYear: String(year),
    solMonth: String(month).padStart(2, '0'),
    numOfRows: '100',
    _type: 'json',
  })
  const response = await fetch(`${HOLIDAY_API_ENDPOINT}?${params}`)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`holiday api failed: ${response.status} ${body.slice(0, 180)}`)
  }
  const rawText = await response.text()
  if (!rawText) return []
  try {
    return parseHolidayItemsFromJson(JSON.parse(rawText))
  } catch {
    return parseHolidayItemsFromXml(rawText)
  }
}

const fetchHolidayMapByYear = async (year) => {
  const holidayMap = {}
  let hasSuccess = false
  for (const month of MONTHS) {
    try {
      const items = await fetchHolidayItemsByMonth(year, month)
      hasSuccess = true
      items.forEach((item) => {
        if (!holidayMap[item.dateStr]) holidayMap[item.dateStr] = []
        if (!holidayMap[item.dateStr].includes(item.label)) {
          holidayMap[item.dateStr].push(item.label)
        }
      })
    } catch (err) {
      console.warn('holiday month fetch failed', { year, month, error: err?.message })
    }
  }
  if (!hasSuccess) throw new Error('all holiday month fetches failed')
  return holidayMap
}

const syncHolidayYear = async (supabaseAdmin, { year, force = false }) => {
  if (!HOLIDAY_API_KEY) throw new Error('REST_HOLIDAY_SERVICE_KEY is not configured')

  const yearKey = String(year)
  if (!YEAR_PATTERN.test(yearKey)) throw new Error('year must be YYYY format')

  const { stamp } = getKstYearMonth()

  const { data: schedulesRow } = await supabaseAdmin
    .from(TABLE)
    .select('data')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('state_type', 'schedules')
    .maybeSingle()

  const current = schedulesRow?.data || {}
  const currentHolidaySyncByYear = normalizeHolidaySyncByYear(current.holidaySyncByYear)

  if (!force && currentHolidaySyncByYear[yearKey] === stamp) {
    return { ok: true, skipped: true, year: Number(yearKey), stamp, workspaceId: WORKSPACE_ID }
  }

  const holidayMap = await fetchHolidayMapByYear(Number(yearKey))
  const currentHolidayNotes = normalizeHolidayNotes(current.holidayNotes)
  const mergedHolidayNotes = mergeHolidayNotesForYear(currentHolidayNotes, yearKey, holidayMap)
  const nextHolidaySyncByYear = { ...currentHolidaySyncByYear, [yearKey]: stamp }

  await supabaseAdmin.from(TABLE).upsert(
    {
      workspace_id: WORKSPACE_ID,
      state_type: 'schedules',
      data: {
        ...current,
        holidayNotes: mergedHolidayNotes,
        holidaySyncByYear: nextHolidaySyncByYear,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,state_type' },
  )

  return {
    ok: true,
    skipped: false,
    year: Number(yearKey),
    stamp,
    totalHolidayDates: Object.keys(holidayMap).length,
    workspaceId: WORKSPACE_ID,
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method-not-allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let yearInput, forceInput
  if (req.method === 'GET') {
    const url = new URL(req.url)
    yearInput = url.searchParams.get('year')
    forceInput = url.searchParams.get('force')
  } else {
    const body = await req.json().catch(() => ({}))
    yearInput = body?.year
    forceInput = body?.force
  }

  const parsedYear = Number(yearInput)
  const year = Number.isInteger(parsedYear) ? parsedYear : getKstYearMonth().year
  const force =
    forceInput === true || forceInput === 'true' || forceInput === '1' || forceInput === 1

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const result = await syncHolidayYear(supabaseAdmin, { year, force })
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('syncHolidays failed', err?.message)
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'internal' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
