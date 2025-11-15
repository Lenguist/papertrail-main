'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'
import { getProfileByUsername, getFollowCounts, type PublicProfile } from '@/lib/social'
import FollowButton from '@/components/FollowButton'

type LibraryItem = {
  openalex_id: string
  inserted_at: string
  status?: 'to_read' | 'reading' | 'read'
  papers: {
    openalex_id: string
    title: string
    authors_json: string[] | null
    year?: number | null
    url?: string | null
    source?: string | null
  } | null
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>()
  const usernameParam = params?.username
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null)
  const [items, setItems] = useState<LibraryItem[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'to_read' | 'reading' | 'read'>('all')
  const [tab, setTab] = useState<'library' | 'followers' | 'following'>('library')
  const [followers, setFollowers] = useState<any[]>([])
  const [following, setFollowing] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      setSession(data.session ?? null)

      const p = await getProfileByUsername(String(usernameParam))
      if (!p) {
        router.replace('/404')
        return
      }
      setProfile(p)
      const c = await getFollowCounts(p.id)
      setCounts(c)
      // initial library load
      const base = supabaseBrowser
        .from('user_papers')
        .select('openalex_id, inserted_at, status, papers(*)')
        .eq('user_id', p.id)
        .order('inserted_at', { ascending: false })
      const res = await base
      if (!res.error) setItems((res.data as any) ?? [])
      // load follower/following lists
      if (p.id) {
        try {
          // Get followers (people following this user)
          const folRes = await supabaseBrowser
            .from('follows')
            .select('follower_id')
            .eq('following_id', p.id)
          
          if (!folRes.error && folRes.data) {
            if (folRes.data.length > 0) {
              const followerIds = folRes.data.map((f: any) => f.follower_id)
              const followerProfiles = await supabaseBrowser
                .from('profiles')
                .select('id,username,display_name')
                .in('id', followerIds)
              
              if (!followerProfiles.error && followerProfiles.data) {
                const profileMap: any = {}
                for (const prof of followerProfiles.data as any[]) {
                  profileMap[prof.id] = prof
                }
                const formatted = folRes.data.map((f: any) => ({
                  follower_id: f.follower_id,
                  profiles: profileMap[f.follower_id]
                }))
                setFollowers(formatted)
              }
            } else {
              setFollowers([])
            }
          }
          
          // Get following (people this user follows)
          const ingRes = await supabaseBrowser
            .from('follows')
            .select('following_id')
            .eq('follower_id', p.id)
          
          if (!ingRes.error && ingRes.data) {
            if (ingRes.data.length > 0) {
              const followingIds = ingRes.data.map((f: any) => f.following_id)
              const followingProfiles = await supabaseBrowser
                .from('profiles')
                .select('id,username,display_name')
                .in('id', followingIds)
              
              if (!followingProfiles.error && followingProfiles.data) {
                const profileMap: any = {}
                for (const prof of followingProfiles.data as any[]) {
                  profileMap[prof.id] = prof
                }
                const formatted = ingRes.data.map((f: any) => ({
                  following_id: f.following_id,
                  profiles: profileMap[f.following_id]
                }))
                setFollowing(formatted)
              }
            } else {
              setFollowing([])
            }
          }
        } catch (error) {
          console.error('Error loading followers/following:', error)
        }
      }
      setLoading(false)
    }
    if (usernameParam) init()
  }, [usernameParam, router])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items
    return items.filter((it: any) => it.status === statusFilter)
  }, [items, statusFilter])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">Loading…</p>
      </div>
    )
  }
  if (!profile) return null

  const isMe = session?.user?.id === profile.id

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {profile.display_name || profile.username}
          </h1>
          {profile.username && (
            <p className="text-sm text-gray-600 dark:text-gray-300">@{profile.username}</p>
          )}
          {profile.bio && <p className="mt-2 text-gray-700 dark:text-gray-300">{profile.bio}</p>}
          {counts && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="chip mr-2">{counts.followers} followers</span>
              <span className="chip">{counts.following} following</span>
            </p>
          )}
        </div>
        {!isMe && <FollowButton targetUserId={profile.id} />}
      </div>

      <div className="mb-4 flex items-center gap-2">
        {(['library', 'followers', 'following'] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 text-sm rounded ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'library' && (
      <div className="mb-3 flex items-center gap-2">
        <button
          className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setStatusFilter('all')}
        >
          All
        </button>
        <button
          className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'to_read' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setStatusFilter('to_read')}
        >
          To Read
        </button>
        <button
          className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'reading' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setStatusFilter('reading')}
        >
          Reading
        </button>
        <button
          className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'read' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setStatusFilter('read')}
        >
          Read
        </button>
      </div>
      )}

      {tab === 'library' && (filtered.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">No items yet.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((it) => {
            const p = it.papers
            const authors = (p?.authors_json ?? []) as string[]
            return (
              <li key={it.openalex_id} className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                <div>
                  {p?.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="float-left text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 mr-2"
                      title="Open paper"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  <div className="font-medium text-gray-900 dark:text-white">{p?.title ?? it.openalex_id}</div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {expandedAuthors.has(it.openalex_id) ? (
                    <div>
                      {authors.join(', ')}
                      {authors.length > 12 && (
                        <button
                          onClick={() => setExpandedAuthors(prev => {
                            const next = new Set(prev)
                            next.delete(it.openalex_id)
                            return next
                          })}
                          className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          collapse
                        </button>
                      )}
                    </div>
                  ) : authors.length > 12 ? (
                    <div>
                      {authors.slice(0, 12).join(', ')}...
                      <button
                        onClick={() => setExpandedAuthors(prev => new Set(prev).add(it.openalex_id))}
                        className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        expand
                      </button>
                    </div>
                  ) : (
                    <div>
                      {authors.join(', ')}
                    </div>
                  )}
                </div>
                {p?.year && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Date published: {p.year}
                  </div>
                )}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Date added to the library: {new Date(it.inserted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ (\d{4})/, ', $1')}
                </div>
                <div className="mt-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    it.status === 'read' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                    : it.status === 'reading' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                  }`}>
                    {it.status === 'to_read' ? 'To read' : it.status === 'reading' ? 'Reading' : 'Read'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      ))}

      {tab === 'followers' && (
        followers.length === 0 ? (
          <p className="text-gray-700 dark:text-gray-300">No followers yet.</p>
        ) : (
          <ul className="space-y-2">
            {followers.map((f: any) => (
              <li key={f.follower_id} className="flex items-center justify-between rounded border border-gray-200 p-2 dark:border-zinc-800">
                <div>
                  <a href={`/u/${f.profiles?.username ?? ''}`} className="font-medium hover:underline">
                    {f.profiles?.display_name ?? f.profiles?.username ?? f.follower_id}
                  </a>
                  {f.profiles?.username && (
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">@{f.profiles.username}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'following' && (
        following.length === 0 ? (
          <p className="text-gray-700 dark:text-gray-300">Not following anyone yet.</p>
        ) : (
          <ul className="space-y-2">
            {following.map((f: any) => (
              <li key={f.following_id} className="flex items-center justify-between rounded border border-gray-200 p-2 dark:border-zinc-800">
                <div>
                  <a href={`/u/${f.profiles?.username ?? ''}`} className="font-medium hover:underline">
                    {f.profiles?.display_name ?? f.profiles?.username ?? f.following_id}
                  </a>
                  {f.profiles?.username && (
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">@{f.profiles.username}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}


