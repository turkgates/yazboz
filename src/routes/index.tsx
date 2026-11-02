import { createFileRoute, redirect } from '@tanstack/react-router'
import { getLocalSession } from '@/lib/supabase'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getLocalSession()
    if (!session) {
      throw redirect({ to: '/auth' })
    }
    throw redirect({ to: '/home' })
  },
  component: () => null,
})
