import { seedDevUsersOnce } from './seedUsers.js'

seedDevUsersOnce()
  .then((result) => {
    if (result.seeded) {
      console.log(`Seeded dev user "${result.username}"`)
    } else {
      console.log(`Dev user "${result.username}" already exists — no seed needed`)
    }
  })
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
