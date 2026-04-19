import { Editor, InputRule } from "https://esm.sh/@tiptap/core@3.22.4";
import Image from "https://esm.sh/@tiptap/extension-image@3.22.4";
import Link from "https://esm.sh/@tiptap/extension-link@3.22.4";
import Placeholder from "https://esm.sh/@tiptap/extension-placeholder@3.22.4";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@3.22.4";
import TaskItem from "https://esm.sh/@tiptap/extension-task-item@3.22.4";
import TaskList from "https://esm.sh/@tiptap/extension-task-list@3.22.4";
import { Markdown } from "https://esm.sh/tiptap-markdown@0.9.0";

const MARKDOWN_LINK_INPUT = /(?:^|\s)\[([^\]]+)]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)$/;

const MarkdownLink = Link.configure({
  autolink: true,
  linkOnPaste: true,
  openOnClick: true,
}).extend({
  addInputRules() {
    return [
      new InputRule({
        find: MARKDOWN_LINK_INPUT,
        handler: ({ state, range, match }) => {
          const text = match[1];
          const href = match[2];
          const fullMatch = match[0];
          const textStart = range.from + fullMatch.indexOf("[") + 1;
          const textEnd = textStart + text.length;
          const tr = state.tr;

          tr.delete(textEnd, range.to);
          tr.delete(textStart - 1, textStart);
          tr.addMark(textStart - 1, textStart - 1 + text.length, this.type.create({ href }));
          tr.removeStoredMark(this.type);
        },
      }),
    ];
  },
});

const initialMarkdown = `# ship mdbar

---

## what changes this week

- [x] make the menu bar panel feel native
- [x] add dark mode and typography controls
- [ ] support pasted images and markdown links

> Your notes stay on disk in plain markdown.

[Open the repo](https://github.com/rishabhsai/mdbar)

![Desk view](https://picsum.photos/seed/mdbar-demo/900/420)
`;

const mount = document.querySelector("[data-demo-editor]");

if (mount) {
  new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      MarkdownLink,
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          loading: "lazy",
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Try markdown shortcuts here…",
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: initialMarkdown,
    autofocus: false,
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.16 },
);

document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
