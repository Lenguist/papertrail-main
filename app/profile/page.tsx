 'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'
import { fetchMyProfile } from '@/lib/profile'
import { getFollowCounts } from '@/lib/social'
import dynamic from 'next/dynamic'
import LibrarySnapshot from '@/components/LibrarySnapshot'

const ReadingByQuarter = dynamic(() => import('@/components/ReadingByQuarter'), { ssr: false })

export default function ProfilePage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null)
  const [libraryCount, setLibraryCount] = useState<number | null>(null)
  const [postsCount, setPostsCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refetchProfile = async () => {
    const p = await fetchMyProfile()
    setProfile(p)
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      if (!data.session) {
        router.push('/auth')
        return
      }
      setSession(data.session)
      const p = await fetchMyProfile()
      setProfile(p)
      if (p) {
        const c = await getFollowCounts(p.id)
        setCounts(c)
        const libRes = await supabaseBrowser.from('user_papers').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
        setLibraryCount(libRes.count ?? 0)
        const postRes = await supabaseBrowser.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
        setPostsCount(postRes.count ?? 0)
      }
      setLoading(false)
    }
    init()

    // Listen for visibility changes to refresh profile when returning to this page
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refetchProfile()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [router])

  if (!session || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">{loading ? 'Loading…' : 'Redirecting…'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="h-32 w-32 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.display_name || profile?.username || 'Profile'} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile?.display_name || profile?.username}</h1>
            {profile?.username && <p className="text-sm text-gray-600 dark:text-gray-300">@{profile.username}</p>}
            {profile?.bio && <p className="mt-2 text-gray-700 dark:text-gray-300">{profile.bio}</p>}
            <div className="mt-3 flex items-center gap-2">
              <span className="chip">{libraryCount ?? 0} library</span>
              <span className="chip">{postsCount ?? 0} posts</span>
              {counts && (
                <>
                  <span className="chip">{counts.followers} followers</span>
                  <span className="chip">{counts.following} following</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/u/${profile?.username ?? ''}`} className="rounded px-3 py-1.5 text-sm text-gray-800 hover:bg-orange-50 dark:text-white dark:hover:bg-orange-900/20">Public Profile</a>
          <a href="/profile/settings" className="btn-secondary px-3 py-1.5 text-sm">Settings</a>
        </div>
      </div>
      {/* You can add recent activity, charts, or other Strava-like widgets below */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
        {(libraryCount ?? 0) === 0 && (postsCount ?? 0) === 0 && (
          <p className="text-gray-700 dark:text-gray-300">This is your profile overview. Add charts, reading streaks, or highlights here to make it Strava-like.</p>
        )}
        {/* Reading by quarter chart */}
        {profile?.id && (
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore -- profile.id should exist when logged in
          <div className="mt-4">
            {/* lazy load component client-side */}
            <ReadingByQuarter userId={profile.id} />
            {/* library snapshot (recent additions) */}
            {/* @ts-ignore -- profile.id exists when logged in */}
            <LibrarySnapshot userId={profile.id} />
          </div>
        )}
      </div>
    </div>
  )
}


