import { Fragment, type ReactNode } from "react";
import { useContentStore } from "../../store/contentStore";
import type { ContentIndex } from "../contentIndex";
import { tokenize } from "./tokenizer";
import {
  FORMAT_TAGS,
  GLOSSARY_REF_TAGS,
  REF_TAGS,
  ROLL_TAGS,
  displayText,
  formatAtk,
  formatHit,
  formatRecharge,
} from "./tags";

/** Renders a string containing inline {@tag} markup as React nodes. */
export function InlineText({ text }: { text: string }) {
  const index = useContentStore((s) => s.index);
  return <>{renderTokens(text, index)}</>;
}

function renderTokens(text: string, index: ContentIndex): ReactNode {
  return tokenize(text).map((tok, i) => (
    <Fragment key={i}>
      {tok.type === "text" ? tok.text : renderTag(tok.tag, tok.args, index)}
    </Fragment>
  ));
}

function renderTag(tag: string, args: string[], index: ContentIndex): ReactNode {
  const fmt = FORMAT_TAGS[tag];
  if (fmt) {
    const content = renderTokens(args[0] ?? "", index);
    switch (fmt) {
      case "bold":
        return <strong>{content}</strong>;
      case "italic":
        return <em>{content}</em>;
      case "strike":
        return <s>{content}</s>;
      case "underline":
        return <u>{content}</u>;
      case "note":
        return <em className="text-ink/70">{content}</em>;
    }
  }

  switch (tag) {
    case "h":
      return (
        <>
          <strong>Hit:</strong>{" "}
        </>
      );
    case "atk":
      return <em>{formatAtk(args[0] ?? "")}</em>;
    case "hit":
      return <RollChip>{formatHit(args[0] ?? "")}</RollChip>;
    case "dc":
      return <span>DC {args[0]}</span>;
    case "recharge":
      return <span>{formatRecharge(args[0])}</span>;
  }

  if (ROLL_TAGS.has(tag) || tag === "scaledamage" || tag === "scaledice") {
    return <RollChip>{displayText(tag, args)}</RollChip>;
  }

  if (REF_TAGS.has(tag)) {
    const entity = index.resolveTag(tag, args);
    return (
      <RefSpan resolved={!!entity} title={entity ? `${entity.__type} · ${entity.source}` : undefined}>
        {displayText(tag, args)}
      </RefSpan>
    );
  }

  if (GLOSSARY_REF_TAGS.has(tag)) {
    return <RefSpan resolved={false}>{displayText(tag, args)}</RefSpan>;
  }

  // Unknown tag: render its display text so content is never lost.
  return <>{displayText(tag, args)}</>;
}

/** A rollable dice notation chip. Rolling is not yet wired up. */
function RollChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-blood/10 px-1 font-medium text-blood" title="Rollable">
      {children}
    </span>
  );
}

/**
 * A cross-reference. Resolved refs are emphasized; unresolved ones get a dotted
 * underline. TODO: click-to-navigate to the referenced entity (needs shared
 * selection state, added in a later phase).
 */
function RefSpan({
  children,
  resolved,
  title,
}: {
  children: ReactNode;
  resolved: boolean;
  title?: string;
}) {
  return (
    <span
      className={
        resolved
          ? "cursor-help text-blood underline decoration-blood/40"
          : "underline decoration-dotted decoration-ink/30"
      }
      title={title}
    >
      {children}
    </span>
  );
}
