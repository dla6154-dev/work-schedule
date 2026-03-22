import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey)
const workspaceId = import.meta.env.VITE_SUPABASE_WORKSPACE_ID || 'default'

export const supabase = hasConfig ? createClient(supabaseUrl, supabaseAnonKey) : null
export const isFirebaseConfigured = hasConfig

const TABLE = 'work_widget_states'

const toArray = (value) => (Array.isArray(value) ? value : [])
const toObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const toSchemaVersion = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

const buildSharedPayloadFromParts = ({ core = {}, schedules = {}, users = {} } = {}) => ({
  schemaVersion: Math.max(
    toSchemaVersion(core.schemaVersion),
    toSchemaVersion(schedules.schemaVersion),
    toSchemaVersion(users.schemaVersion),
  ),
  centers: toArray(core.centers),
  dispatchSites: toArray(core.dispatchSites),
  workTypes: toArray(core.workTypes),
  dailyNotes: toObject(schedules.dailyNotes),
  periodSchedules: toArray(schedules.periodSchedules),
  userProfiles: toObject(users.userProfiles),
  userSchedules: toObject(users.userSchedules),
})

const splitSharedPayload = (payload = {}) => {
  const schemaVersion = toSchemaVersion(payload.schemaVersion)
  return {
    core: {
      schemaVersion,
      centers: toArray(payload.centers),
      dispatchSites: toArray(payload.dispatchSites),
      workTypes: toArray(payload.workTypes),
    },
    schedules: {
      schemaVersion,
      dailyNotes: toObject(payload.dailyNotes),
      periodSchedules: toArray(payload.periodSchedules),
    },
    users: {
      schemaVersion,
      userProfiles: toObject(payload.userProfiles),
      userSchedules: toObject(payload.userSchedules),
    },
  }
}

const fetchStateRow = async (stateType) => {
  if (!supabase) return null
  const { data } = await supabase
    .from(TABLE)
    .select('data')
    .eq('workspace_id', workspaceId)
    .eq('state_type', stateType)
    .maybeSingle()
  return data?.data || null
}

const upsertStateRow = async (stateType, data) => {
  if (!supabase) return
  await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: workspaceId,
        state_type: stateType,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,state_type' },
    )
}

export const subscribeAuth = (callback) => {
  if (!supabase) return () => {}
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null)
  })
  return () => subscription.unsubscribe()
}

export const ensureAnonymousAuth = async () => {
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user) return session.user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

export const subscribeSharedState = (onData, onError) => {
  if (!supabase) return () => {}

  const snapshots = { core: null, schedules: null, users: null }
  const isReady = { core: false, schedules: false, users: false }

  const emitMerged = () => {
    if (!isReady.core || !isReady.schedules || !isReady.users) return
    const payload = buildSharedPayloadFromParts({
      core: snapshots.core || {},
      schedules: snapshots.schedules || {},
      users: snapshots.users || {},
    })
    const exists = Boolean(snapshots.core || snapshots.schedules || snapshots.users)
    onData({ exists: () => exists, data: () => payload })
  }

  Promise.all([fetchStateRow('core'), fetchStateRow('schedules'), fetchStateRow('users')])
    .then(([core, schedules, users]) => {
      snapshots.core = core
      snapshots.schedules = schedules
      snapshots.users = users
      isReady.core = true
      isReady.schedules = true
      isReady.users = true
      emitMerged()
    })
    .catch((err) => onError?.(err))

  const channel = supabase
    .channel(`work_widget_states_${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        const stateType = payload.new?.state_type || payload.old?.state_type
        if (!stateType || !['core', 'schedules', 'users'].includes(stateType)) return
        snapshots[stateType] = payload.new?.data || null
        isReady[stateType] = true
        emitMerged()
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime channel error'))
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

export const readSharedStateOnce = async () => {
  if (!supabase) return null
  const [core, schedules, users] = await Promise.all([
    fetchStateRow('core'),
    fetchStateRow('schedules'),
    fetchStateRow('users'),
  ])
  const exists = Boolean(core || schedules || users)
  return {
    exists: () => exists,
    data: () =>
      buildSharedPayloadFromParts({
        core: core || {},
        schedules: schedules || {},
        users: users || {},
      }),
  }
}

export const ensureSplitSharedState = async () => {
  // Supabase migration: no legacy split needed
}

export const saveSharedState = async (payload, options = {}) => {
  if (!supabase) return
  const split = splitSharedPayload(payload)
  const changedGroups =
    options?.changedGroups && typeof options.changedGroups === 'object'
      ? options.changedGroups
      : { core: true, schedules: true, users: true }

  const tasks = []
  if (changedGroups.core !== false) tasks.push(upsertStateRow('core', split.core))
  if (changedGroups.schedules !== false) tasks.push(upsertStateRow('schedules', split.schedules))
  if (changedGroups.users !== false) tasks.push(upsertStateRow('users', split.users))

  await Promise.all(tasks)
}
