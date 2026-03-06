import { createElement, type ReactNode } from "react";
import { parseDocument } from "htmlparser2";
import type { DataNode, Element, Node } from "domhandler";

type RenderHtmlOptions = {
  keyPrefix?: string;
  markerAttr?: string;
};

const BOOLEAN_ATTRS = new Set([
  "allowFullScreen",
  "async",
  "autoPlay",
  "controls",
  "default",
  "defer",
  "disabled",
  "formNoValidate",
  "hidden",
  "loop",
  "multiple",
  "muted",
  "noModule",
  "noValidate",
  "open",
  "playsInline",
  "readOnly",
  "required",
  "reversed",
  "selected"
]);
const TABLE_CONTEXT_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup"]);
const UNWRAP_CONTAINER_CLASSES = new Set(["table-scroll-wrapper", "table-scroll-inner"]);
const PRESERVE_CONTAINER_CLASSES = new Set(["video-embed", "article-gallery", "article-gallery__item"]);

function toReactAttrName(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  if (name === "allowfullscreen") return "allowFullScreen";
  if (name === "readonly") return "readOnly";
  if (name === "referrerpolicy") return "referrerPolicy";
  if (name === "srcset") return "srcSet";
  if (name === "tabindex") return "tabIndex";
  if (name === "maxlength") return "maxLength";
  return name;
}

function markdownClassForTag(tagName: string): string {
  const base = "md-copy-node";
  switch (tagName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      return `${base} md-copy-heading md-copy-${tagName}`;
    case "p":
      return `${base} md-copy-p`;
    case "ul":
    case "ol":
      return `${base} md-copy-list md-copy-${tagName}`;
    case "li":
      return `${base} md-copy-li`;
    case "a":
      return `${base} md-copy-a`;
    case "img":
      return `${base} md-copy-img`;
    case "table":
      return `${base} md-copy-table`;
    case "th":
      return `${base} md-copy-th`;
    case "td":
      return `${base} md-copy-td`;
    case "blockquote":
      return `${base} md-copy-blockquote`;
    case "strong":
      return `${base} md-copy-strong`;
    case "em":
      return `${base} md-copy-em`;
    default:
      return base;
  }
}

function convertAttributes(
  attribs: Record<string, string> | undefined,
  markerAttr: string,
  tagName: string
): Record<string, string | boolean> {
  const mdClass = markdownClassForTag(tagName);
  const props: Record<string, string | boolean> = {
    [markerAttr]: "true",
    className: mdClass
  };

  if (!attribs) return props;

  for (const [rawName, value] of Object.entries(attribs)) {
    const name = toReactAttrName(rawName);
    if (name === "style") continue;
    if (name === "className") {
      props.className = `${value} ${mdClass}`.trim();
      continue;
    }
    if (BOOLEAN_ATTRS.has(name)) {
      props[name] = value === "" || value.toLowerCase() === "true" || value.toLowerCase() === name.toLowerCase();
      continue;
    }
    props[name] = value;
  }

  return props;
}

function shouldUnwrapElement(element: Element): boolean {
  const attribs = element.attribs ?? {};
  const classAttr = attribs.class ?? "";
  const classes = classAttr.split(/\s+/).filter(Boolean);

  if (element.name === "div" && classes.some((className) => UNWRAP_CONTAINER_CLASSES.has(className))) {
    return true;
  }

  if (element.name !== "div" && element.name !== "section") {
    return false;
  }

  if (classes.some((className) => PRESERVE_CONTAINER_CLASSES.has(className))) {
    return false;
  }

  const hasClass = classes.length > 0;
  const hasId = Boolean(attribs.id);
  const hasStyle = Boolean(attribs.style);
  const hasDataAttrs = Object.keys(attribs).some((name) => name.startsWith("data-"));

  return !hasClass && !hasId && !hasStyle && !hasDataAttrs;
}

function renderNode(node: Node, key: string, markerAttr: string, parentTag?: string): ReactNode {
  if (node.type === "text") {
    const text = (node as DataNode).data;
    if (parentTag && TABLE_CONTEXT_TAGS.has(parentTag) && /^\s*$/.test(text)) {
      return null;
    }
    return text;
  }

  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
    return null;
  }

  const element = node as Element;
  const children = (element.children ?? [])
    .map((child, index) => renderNode(child, `${key}-${index}`, markerAttr, element.name))
    .filter((child) => child !== null);

  if (shouldUnwrapElement(element)) {
    return children.length ? children : null;
  }

  const props = convertAttributes(element.attribs, markerAttr, element.name);

  return createElement(element.name, { ...props, key }, children.length ? children : undefined);
}

export function renderHtmlAsReactNodes(html: string, options: RenderHtmlOptions = {}): ReactNode[] {
  const markerAttr = options.markerAttr ?? "data-md-copy";
  const keyPrefix = options.keyPrefix ?? "md";
  const document = parseDocument(html, { decodeEntities: false });

  return document.children
    .map((node, index) => renderNode(node, `${keyPrefix}-${index}`, markerAttr))
    .filter((node): node is ReactNode => node !== null);
}
