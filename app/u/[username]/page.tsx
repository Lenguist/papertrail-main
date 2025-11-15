'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'
import { getProfileByUsername, getFollowCounts, type PublicProfile } from '@/lib/social'
import { formatRelativeTime, formatDateTime } from '@/lib/formatTime'
import FollowButton from '@/components/FollowButton'
import dynamic from 'next/dynamic'

const ReadingByQuarter = dynamic(() => import('@/components/ReadingByQuarter'), { ssr: false })

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

type Post = {
  id: string
  type: 'added_to_library' | 'status_changed' | 'added_to_shelf'
  openalex_id: string | null
  status: 'to_read' | 'reading' | 'read' | null
  created_at: string
  paper?: any
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
  const [showLibraryModal, setShowLibraryModal] = useState(false)
  const [followers, setFollowers] = useState<any[]>([])
  const [following, setFollowing] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [userPosts, setUserPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items
    return items.filter((it: any) => it.status === statusFilter)
  }, [items, statusFilter])

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      setSession(data.session ?? null)

      const p = await getProfileByUsername(String(usernameParam))
      if (!p) {
        router.replace('/404')
        return
      }
      
      // If viewing own profile, redirect to /profile
      if (data.session?.user?.id === p.id) {
        router.replace('/profile')
        return
      }
      
      setProfile(p)
      const c = await getFollowCounts(p.id)
      setCounts(c)
      
      // Load library items
      const libRes = await supabaseBrowser
        .from('user_papers')
        .select('openalex_id, inserted_at, status, papers(*)')
        .eq('user_id', p.id)
        .order('inserted_at', { ascending: false })
      if (!libRes.error) setItems((libRes.data as any) ?? [])
      
      // Load user's posts
      const postsRes = await supabaseBrowser
        .from('posts')
        .select('id, type, openalex_id, status, created_at')
        .eq('user_id', p.id)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (!postsRes.error && postsRes.data) {
        // Fetch papers for these posts
        const postOpenalexIds = (postsRes.data as any[])
          .map((post: any) => post.openalex_id)
          .filter(Boolean) as string[]
        
        if (postOpenalexIds.length > 0) {
          const papersRes = await supabaseBrowser
            .from('papers')
            .select('*')
            .in('openalex_id', postOpenalexIds)
          
          if (!papersRes.error) {
            const papersMap: any = {}
            for (const paper of papersRes.data as any[]) {
              papersMap[paper.openalex_id] = paper
            }
            
            const postsWithPapers = (postsRes.data as any[]).map((post) => ({
              ...post,
              paper: papersMap[post.openalex_id] || null
            }))
            setUserPosts(postsWithPapers)
          }
        } else {
          setUserPosts(postsRes.data as any[])
        }
      }
      setPostsLoading(false)
      
      // Load followers/following
      if (p.id) {
        try {
          const folRes = await supabaseBrowser
            .from('follows')
            .select('follower_id')
            .eq('following_id', p.id)
          
          if (!folRes.error && folRes.data) {
            if (folRes.data.length > 0) {
              const followerIds = folRes.data.map((f: any) => f.follower_id)
              const followerProfiles = await supabaseBrowser
                .from('profiles')
                .select('id,username,display_name,avatar_url')
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
          
          const ingRes = await supabaseBrowser
            .from('follows')
            .select('following_id')
            .eq('follower_id', p.id)
          
          if (!ingRes.error && ingRes.data) {
            if (ingRes.data.length > 0) {
              const followingIds = ingRes.data.map((f: any) => f.following_id)
              const followingProfiles = await supabaseBrowser
                .from('profiles')
                .select('id,username,display_name,avatar_url')
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

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">Loading…</p>
      </div>
    )
  }
  if (!profile) return null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="h-32 w-32 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name || profile.username || 'Profile'} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.display_name || profile.username}</h1>
            {profile.username && <p className="text-sm text-gray-600 dark:text-gray-300">@{profile.username}</p>}
            {profile.bio && <p className="mt-2 text-gray-700 dark:text-gray-300">{profile.bio}</p>}
            {counts && (
              <div className="mt-3 flex items-center gap-2">
                <span className="chip">{items.length} library</span>
                <span className="chip">{counts.followers} followers</span>
                <span className="chip">{counts.following} following</span>
              </div>
            )}
          </div>
        </div>
        <FollowButton targetUserId={profile.id} />
      </div>

      {/* Reading by Quarter */}
      {profile?.id && (
        <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
          {items.length === 0 && (
            <p className="text-gray-700 dark:text-gray-300">No books in library yet.</p>
          )}
          {items.length > 0 && (
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore -- profile.id should exist
            <ReadingByQuarter userId={profile.id} />
          )}
        </div>
      )}

      {/* Library Snapshot */}
      {profile?.id && (
        <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{profile.display_name || profile.username}'s Library</h2>
            <button
              onClick={() => setShowLibraryModal(true)}
              className="btn-secondary px-3 py-1.5 text-sm"
            >
              See All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{items.filter((i: any) => i.status === 'to_read').length}</div>
                <div className="text-xs text-blue-600 dark:text-blue-300">To Read</div>
              </div>
            </div>
            <div className="rounded-lg bg-pink-50 p-3 dark:bg-pink-900/20">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-pink-700 dark:text-pink-400">{items.filter((i: any) => i.status === 'reading').length}</div>
                <div className="text-xs text-pink-600 dark:text-pink-300">Reading</div>
              </div>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-900/20">
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{items.filter((i: any) => i.status === 'read').length}</div>
                <div className="text-xs text-orange-600 dark:text-orange-300">Read</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Updates */}
      <div className="mb-6 rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{profile.display_name || profile.username}'s Recent Updates</h2>
        {postsLoading ? (
          <p className="text-gray-700 dark:text-gray-300">Loading…</p>
        ) : userPosts.length === 0 ? (
          <p className="text-gray-700 dark:text-gray-300">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {userPosts.map((post) => {
              let action = ''
              if (post.type === 'added_to_shelf') action = `added to library`
              if (post.type === 'status_changed') action = `marked as`
              if (post.type === 'added_to_library') action = 'added to library'
              return (
                <li key={post.id} className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="text-sm text-gray-600 dark:text-gray-400 flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">{profile.display_name || profile.username}</span> {action}
                      </div>
                      {post.status && (
                        <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${
                          post.status === 'read' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          : post.status === 'reading' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        }`}>
                          {post.status === 'to_read' ? 'To read' : post.status === 'reading' ? 'Reading' : 'Read'}
                        </div>
                      )}
                    </div>
                    <time
                      className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0"
                      title={formatDateTime(post.created_at)}
                    >
                      {formatRelativeTime(post.created_at)}
                    </time>
                  </div>
                  {post.paper && (
                    <div>
                      {post.paper.url && (
                        <a
                          href={post.paper.url}
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
                      <div className="font-medium text-gray-900 dark:text-white">{post.paper.title}</div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.display_name || profile.username}'s Library</h2>
              <button
                onClick={() => setShowLibraryModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4 flex items-center gap-2">
              <button
                className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter('all')}
              >
                All ({items.length})
              </button>
              <button
                className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'to_read' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter('to_read')}
              >
                To Read ({items.filter((i: any) => i.status === 'to_read').length})
              </button>
              <button
                className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'reading' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter('reading')}
              >
                Reading ({items.filter((i: any) => i.status === 'reading').length})
              </button>
              <button
                className={`px-3 py-1.5 text-sm rounded ${statusFilter === 'read' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter('read')}
              >
                Read ({items.filter((i: any) => i.status === 'read').length})
              </button>
            </div>

            {filtered.length === 0 ? (
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}


