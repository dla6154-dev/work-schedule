import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
)

const workspaceId = import.meta.env.VITE_FIREBASE_WORKSPACE_ID || 'default'

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
const auth = app ? getAuth(app) : null
const db = app ? getFirestore(app) : null
const sharedDocRef = db ? doc(db, 'work-widgets', workspaceId) : null
const sharedCoreDocRef = db ? doc(db, 'work-widgets', workspaceId, 'state', 'core') : null
const sharedSchedulesDocRef = db ? doc(db, 'work-widgets', workspaceId, 'state', 'schedules') : null
const sharedUsersDocRef = db ? doc(db, 'work-widgets', workspaceId, 'state', 'users') : null

export const isFirebaseConfigured = hasFirebaseConfig

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

export const subscribeAuth = (callback) => {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}

export const ensureAnonymousAuth = async () => {
  if (!auth) return null
  if (auth.currentUser) return auth.currentUser
  await signInAnonymously(auth)
  return auth.currentUser
}

export const subscribeSharedState = (onData, onError) => {
  if (!sharedCoreDocRef || !sharedSchedulesDocRef || !sharedUsersDocRef) return () => {}

  const snapshots = {
    core: null,
    schedules: null,
    users: null,
  }
  const isReady = {
    core: false,
    schedules: false,
    users: false,
  }

  const emitMergedSnapshot = () => {
    if (!isReady.core || !isReady.schedules || !isReady.users) return
    const payload = buildSharedPayloadFromParts({
      core: snapshots.core?.data() || {},
      schedules: snapshots.schedules?.data() || {},
      users: snapshots.users?.data() || {},
    })
    const exists = Boolean(
      snapshots.core?.exists?.() || snapshots.schedules?.exists?.() || snapshots.users?.exists?.(),
    )
    onData({
      exists: () => exists,
      data: () => payload,
    })
  }

  const createSnapshotHandler = (key) => (snapshot) => {
    snapshots[key] = snapshot
    isReady[key] = true
    emitMergedSnapshot()
  }

  const unsubscribers = [
    onSnapshot(sharedCoreDocRef, createSnapshotHandler('core'), onError),
    onSnapshot(sharedSchedulesDocRef, createSnapshotHandler('schedules'), onError),
    onSnapshot(sharedUsersDocRef, createSnapshotHandler('users'), onError),
  ]

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}

export const readSharedStateOnce = async () => {
  if (!sharedCoreDocRef || !sharedSchedulesDocRef || !sharedUsersDocRef) return null
  const [coreSnap, schedulesSnap, usersSnap] = await Promise.all([
    getDoc(sharedCoreDocRef),
    getDoc(sharedSchedulesDocRef),
    getDoc(sharedUsersDocRef),
  ])
  const exists = coreSnap.exists() || schedulesSnap.exists() || usersSnap.exists()
  return {
    exists: () => exists,
    data: () =>
      buildSharedPayloadFromParts({
        core: coreSnap.data() || {},
        schedules: schedulesSnap.data() || {},
        users: usersSnap.data() || {},
      }),
  }
}

export const ensureSplitSharedState = async () => {
  if (!db || !sharedDocRef || !sharedCoreDocRef || !sharedSchedulesDocRef || !sharedUsersDocRef) return

  const [coreSnap, schedulesSnap, usersSnap] = await Promise.all([
    getDoc(sharedCoreDocRef),
    getDoc(sharedSchedulesDocRef),
    getDoc(sharedUsersDocRef),
  ])
  if (coreSnap.exists() || schedulesSnap.exists() || usersSnap.exists()) return

  const legacySnap = await getDoc(sharedDocRef)
  if (!legacySnap.exists()) return

  const split = splitSharedPayload(legacySnap.data() || {})
  const batch = writeBatch(db)
  batch.set(
    sharedCoreDocRef,
    {
      ...split.core,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  batch.set(
    sharedSchedulesDocRef,
    {
      ...split.schedules,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  batch.set(
    sharedUsersDocRef,
    {
      ...split.users,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await batch.commit()
}

export const saveSharedState = async (payload, options = {}) => {
  if (!db || !sharedCoreDocRef || !sharedSchedulesDocRef || !sharedUsersDocRef) return
  const split = splitSharedPayload(payload)
  const changedGroups =
    options?.changedGroups && typeof options.changedGroups === 'object'
      ? options.changedGroups
      : { core: true, schedules: true, users: true }

  const shouldSaveCore = changedGroups.core !== false
  const shouldSaveSchedules = changedGroups.schedules !== false
  const shouldSaveUsers = changedGroups.users !== false

  if (!shouldSaveCore && !shouldSaveSchedules && !shouldSaveUsers) return

  const docsToWrite = Number(shouldSaveCore) + Number(shouldSaveSchedules) + Number(shouldSaveUsers)
  if (docsToWrite === 1) {
    if (shouldSaveCore) {
      await setDoc(
        sharedCoreDocRef,
        {
          ...split.core,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return
    }
    if (shouldSaveSchedules) {
      await setDoc(
        sharedSchedulesDocRef,
        {
          ...split.schedules,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return
    }
    await setDoc(
      sharedUsersDocRef,
      {
        ...split.users,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    return
  }

  const batch = writeBatch(db)
  if (shouldSaveCore) {
    batch.set(
      sharedCoreDocRef,
      {
        ...split.core,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }
  if (shouldSaveSchedules) {
    batch.set(
      sharedSchedulesDocRef,
      {
        ...split.schedules,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }
  if (shouldSaveUsers) {
    batch.set(
      sharedUsersDocRef,
      {
        ...split.users,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()
}
