import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { BlogPostRow } from "@/lib/blog";
import { BlogPostForm } from "./blog-post-form";

// Soạn 1 bài blog (CEO 2026-10-08) — xem actions/blog.ts.
export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole([...MANAGE_ROLES]);
  const { id } = await params;
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: post }, { data: cats }] = await Promise.all([
    db.from("blog_posts").select("*").eq("id", id).maybeSingle(),
    db.from("website_categories").select("slug, name, parent_id, sort_order").eq("is_published", true).order("sort_order"),
  ]);
  if (!post) notFound();

  return (
    <div className="space-y-4">
      <Link href="/website/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Blog
      </Link>
      <BlogPostForm
        post={post as BlogPostRow}
        categories={((cats ?? []) as { slug: string; name: string; parent_id: string | null }[]).map((c) => ({
          slug: c.slug,
          name: c.name,
          isParent: !c.parent_id,
        }))}
        webUrl={process.env.WEBSITE_PUBLIC_URL ?? "https://thuenhanh.vn"}
      />
    </div>
  );
}
