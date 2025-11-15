'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowserClient'
import { formatRelativeTime, formatDateTime } from '@/lib/formatTime'
import LikeButton from '@/components/LikeButton'

type Post = {
  id: string
  user_id: string
  type: 'added_to_library' | 'status_changed' | 'added_to_shelf'
  openalex_id: string | null
  status: 'to_read' | 'reading' | 'read' | null
  created_at: string
}

export default function FeedPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [profiles, setProfiles] = useState<Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }>>({})
  const [papers, setPapers] = useState<Record<string, any>>({})
  const [likesCount, setLikesCount] = useState<Record<string, number>>({})
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [allProfiles, setAllProfiles] = useState<Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }>>({})

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      if (!data.session) {
        router.push('/auth')
        return
      }
      setSession(data.session)
      // following ids
      const fol = await supabaseBrowser
        .from('follows')
        .select('following_id')
        .eq('follower_id', data.session.user.id)
      const ids = (fol.data ?? []).map((r: any) => r.following_id)
      ids.push(data.session.user.id) // include self
      if (ids.length === 0) {
        setLoading(false)
        return
      }
      // posts
      const pr = await supabaseBrowser
        .from('posts')
        .select('id,user_id,type,openalex_id,status,created_at')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .limit(100)
      if (pr.error) {
        setLoading(false)
        return
      }
      const ps = (pr.data as any) as Post[]
      setPosts(ps)
      // fetch profiles for unique users
      const uniqueUsers = Array.from(new Set(ps.map((p) => p.user_id)))
      const profRes = await supabaseBrowser
        .from('profiles')
        .select('id,username,display_name,avatar_url')
        .in('id', uniqueUsers)
      if (!profRes.error) {
        const map: any = {}
        for (const r of profRes.data as any[]) {
          map[r.id] = { username: r.username, display_name: r.display_name, avatar_url: r.avatar_url }
        }
        setProfiles(map)
      }
      
      // fetch ALL profiles for search functionality
      const allProfRes = await supabaseBrowser.from('profiles').select('id,username,display_name,avatar_url')
      if (!allProfRes.error) {
        const allMap: any = {}
        for (const r of allProfRes.data as any[]) {
          allMap[r.id] = { username: r.username, display_name: r.display_name, avatar_url: r.avatar_url }
        }
        setAllProfiles(allMap)
      }
      // fetch papers for unique openalex ids
      const idsOpen = Array.from(new Set(ps.map((p) => p.openalex_id).filter(Boolean))) as string[]
      if (idsOpen.length > 0) {
        const papRes = await supabaseBrowser.from('papers').select('*').in('openalex_id', idsOpen)
        if (!papRes.error) {
          const map: any = {}
          for (const r of papRes.data as any[]) map[r.openalex_id] = r
          setPapers(map)
        }
      }
      // fetch likes for these posts (counts and whether current user liked them)
      if (ps.length > 0) {
        const postIds = ps.map((p) => p.id)
        const likesRes = await supabaseBrowser.from('post_likes').select('post_id,user_id').in('post_id', postIds)
        if (!likesRes.error) {
          const counts: Record<string, number> = {}
          const likedMap: Record<string, boolean> = {}
          for (const r of likesRes.data as any[]) {
            counts[r.post_id] = (counts[r.post_id] ?? 0) + 1
            if (r.user_id === data.session.user.id) likedMap[r.post_id] = true
          }
          setLikesCount(counts)
          setLikedByMe(likedMap)
        }
      }

      setLoading(false)
    }
    init()
  }, [router])

  if (!session || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-gray-700 dark:text-gray-200">{loading ? 'Loading…' : 'Redirecting…'}</p>
      </div>
    )
  }

  // Helper function for fuzzy matching
  const fuzzyMatch = (name: string, query: string): boolean => {
    const nameLower = name.toLowerCase()
    const queryLower = query.toLowerCase()
    
    // Exact substring match
    if (nameLower.includes(queryLower)) return true
    
    // Fuzzy match: all characters of query appear in order in name
    let queryIdx = 0
    for (let i = 0; i < nameLower.length && queryIdx < queryLower.length; i++) {
      if (nameLower[i] === queryLower[queryIdx]) queryIdx++
    }
    return queryIdx === queryLower.length
  }

  // Filter posts based on search query
  const filteredPosts = searchQuery.trim() === ''
    ? posts
    : (() => {
        // Get matching user IDs from all profiles
        const matchingUserIds = new Set<string>()
        for (const [userId, prof] of Object.entries(allProfiles)) {
          const name = prof?.display_name || prof?.username || ''
          if (fuzzyMatch(name, searchQuery)) {
            matchingUserIds.add(userId)
          }
        }
        
        // Return posts only from matching users
        return posts.filter((p) => matchingUserIds.has(p.user_id))
      })()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">Feed</h1>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search users..."
        className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-orange-600 focus:outline-none dark:border-gray-700 dark:bg-zinc-800 dark:text-white"
      />
      
      {/* Search Results */}
      {searchQuery.trim() !== '' && (() => {
        const matchingUsers = Object.entries(allProfiles)
          .filter(([userId, prof]) => {
            const name = prof?.display_name || prof?.username || ''
            return fuzzyMatch(name, searchQuery)
          })
          .map(([userId, prof]) => ({ userId, ...prof }))
        
        return (
          <div className="mb-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Found {matchingUsers.length} user{matchingUsers.length !== 1 ? 's' : ''}
            </h2>
            <ul className="space-y-2">
              {matchingUsers.map((user) => (
                <li key={user.userId} className="rounded-lg border border-gray-200 p-2 dark:border-zinc-800">
                  <a href={`/u/${user.username ?? ''}`} className="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-900 p-1 rounded">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.display_name || user.username || 'User'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {user.display_name || user.username}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          @{user.username}
                        </div>
                      </div>
                    </div>
                    <div className="text-orange-600 dark:text-orange-400">→</div>
                  </a>
                </li>
              ))}
            </ul>
            <hr className="my-4 border-gray-200 dark:border-zinc-700" />
          </div>
        )
      })()}
      
      {/* Feed Posts */}
      {filteredPosts.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">{searchQuery ? 'No activity from these users.' : 'No activity yet.'}</p>
      ) : (
        <ul className="space-y-3">
          {filteredPosts.map((p) => {
            const prof = profiles[p.user_id]
            const paper = p.openalex_id ? papers[p.openalex_id] : null
            const name = prof?.display_name || prof?.username || p.user_id
            const label =
              p.status === 'to_read' ? 'Want to Read' : p.status === 'reading' ? 'Currently Reading' : p.status === 'read' ? 'Read' : null
            let action = ''
            if (p.type === 'added_to_shelf') action = `added to library`
            if (p.type === 'status_changed') action = `marked as`
            if (p.type === 'added_to_library') action = 'added to library'
            return (
              <li key={p.id} className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden mt-0.5">
                      {prof?.avatar_url ? (
                        <img src={prof.avatar_url} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <a href={`/u/${prof?.username ?? ''}`} className="font-medium text-gray-900 hover:underline dark:text-white">
                          {name}
                        </a>{' '}
                        {action}
                      </div>
                      {p.status && (
                        <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'read' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          : p.status === 'reading' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        }`}>
                          {p.status === 'to_read' ? 'To read' : p.status === 'reading' ? 'Reading' : 'Read'}
                        </div>
                      )}
                    </div>
                  </div>
                  <time
                    className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0"
                    title={formatDateTime(p.created_at)}
                  >
                    {formatRelativeTime(p.created_at)}
                  </time>
                </div>
                {paper && (
                  <>
                    <div>
                      {paper.url && (
                        <a
                          href={paper.url}
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
                      <div className="font-medium text-gray-900 dark:text-white">{paper.title}</div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {expandedAuthors.has(p.id) ? (
                        <div>
                          {(paper.authors_json ?? []).join(', ')}
                          {(paper.authors_json ?? []).length > 12 && (
                            <button
                              onClick={() => setExpandedAuthors(prev => {
                                const next = new Set(prev)
                                next.delete(p.id)
                                return next
                              })}
                              className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                            >
                              collapse
                            </button>
                          )}
                        </div>
                      ) : (paper.authors_json ?? []).length > 12 ? (
                        <div>
                          {(paper.authors_json ?? []).slice(0, 12).join(', ')}...
                          <button
                            onClick={() => setExpandedAuthors(prev => new Set(prev).add(p.id))}
                            className="ml-2 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            expand
                          </button>
                        </div>
                      ) : (
                        <div>
                          {(paper.authors_json ?? []).join(', ')}
                        </div>
                      )}
                    </div>
                    {paper.year && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Date published: {paper.year}
                      </div>
                    )}
                  </>
                )}
                <div className="mt-3">
                  <LikeButton
                    postId={p.id}
                    initialLiked={!!likedByMe[p.id]}
                    initialCount={likesCount[p.id] ?? 0}
                    onToggle={(postId, liked) => {
                      setLikedByMe((s) => ({ ...s, [postId]: liked }))
                      setLikesCount((s) => ({ ...s, [postId]: (s[postId] ?? 0) + (liked ? 1 : -1) }))
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}