import type { Post } from '../types'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { postDate, readingMinutes } from '../lib'

export function PostCard({ post, index = 0 }: { post: Post; index?: number }) {
  const { categoryLabel, formatDate, minutes } = useI18n()
  return (
    <Link className="article-card" to={`/posts/${post.slug}`} style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="article-card-cover">
        {post.coverUrl ? (
          <img className="cover-img" src={post.coverUrl} alt={post.coverAlt} loading="lazy" />
        ) : (
          <div className="cover-fallback">cover</div>
        )}
      </div>
      <div className="article-card-body">
        <div className="article-card-cat">{categoryLabel(post.category)}</div>
        <div className="article-card-title">{post.title}</div>
        <div className="article-card-excerpt">{post.excerpt}</div>
        <div className="article-card-meta">{formatDate(postDate(post))} · {minutes(readingMinutes(post))}</div>
      </div>
    </Link>
  )
}
