---
summary: "My first blog post — setting up a personal blog with a custom static site generator."
tags: [meta, blogging]
---

# Hello World

Welcome to my blog! This is my first post.

I set up this blog using a custom static site generator inspired by
[Armin Ronacher's lucumr](https://lucumr.pocoo.org/). It's a simple
Python-based generator that converts Markdown files into a static website,
deployed via GitHub Pages.

## How It Works

The setup is straightforward:

1. Write posts in **Markdown** with YAML frontmatter
2. A Python generator converts them to HTML using Jinja2 templates
3. GitHub Actions builds and deploys automatically on push

Here's what a post file looks like:

```markdown
---
summary: "A short description shown on the homepage"
tags: [example]
---

# Post Title

Content goes here...
```

## What's Next

I plan to write about programming, tools I use, and things I learn along
the way. Stay tuned!
