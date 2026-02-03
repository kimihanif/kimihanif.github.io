# Hanif's Blog

My personal blog hosted at [kimihanif.github.io](https://kimihanif.github.io).

## Content Structure

- **Blog Posts**: `blog/posts/YYYY/MM-DD-post-name.md` in Markdown format
- **Other Pages**: `blog/name.md` in Markdown format
- **Static Assets**: `blog/static/` contains CSS, fonts, images

## Development

```bash
# Start development server with live reload
make serve

# Generate static site
make build

# Clean build artifacts
make clean
```

## Writing a New Post

Create a file at `blog/posts/YYYY/MM-DD-title.md`:

```markdown
---
summary: "Short description shown on homepage"
tags: [tag1, tag2]
---

# Post Title

Content in Markdown format...
```

Push to `main` and GitHub Actions will build and deploy automatically.
