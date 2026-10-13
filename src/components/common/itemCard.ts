/**
 * What an item's detail card shows, laid out the way 5eTools renders items
 * (`Renderer.item` in its render.js): a type/rarity/attunement line, a
 * category subline, cost and weight opposite damage or AC, properties and
 * mastery, then the item's text followed by the rules for its type, each of
 * its properties and its mastery — looked up from the imported
 * `itemType` / `itemProperty` / `itemMastery` entries.
 */

import type { ContentIndex } from "../../data/contentIndex";
import type { Entry } from "../../data/types";
import type { ImportedEntity } from "../../data/types";
import { itemTypeCode, type Item, type ItemPropertyRef } from "../../data/types/item-content";
import { DAMAGE_TYPES, formatValue, PROPERTY_LABELS, TYPE_LABELS } from "./itemDisplay";

export interface ItemCardData {
  /** "Weapon", "Wondrous Item, Rare (Requires Attunement)". */
  typeLine: string;
  /** "Martial Weapon, Melee Weapon". */
  subtypeLine: string;
  /** "15 gp, 3 lb." */
  costWeight: string;
  /** Right-hand stat lines with inline tags: damage or AC, properties, mastery. */
  stats: string[];
  /** The item's own text, with `{#itemEntry}` templates filled in. */
  entries: Entry[];
  /** Rules merged in from the item's type, properties and mastery. */
  notes: Entry[];
  /** Text 5eTools appends after everything else (`additionalEntries`). */
  additional: Entry[];
  /** "Player's Handbook (2024)". */
  sourceTitle: string;
  page?: number;
}

/** Fields of real 5eTools items beyond the builder's `Item`. */
interface ItemExtras extends Item {
  typeAlt?: string;
  staff?: boolean;
  ammo?: boolean;
  age?: string;
  firearm?: boolean;
  poison?: boolean;
  poisonTypes?: string[];
  tattoo?: boolean;
  acSpecial?: string;
  stealth?: boolean;
  strength?: string | number;
  speed?: number;
  carryingCapacity?: number;
  weightNote?: string;
  ammoType?: string;
  reload?: number;
  additionalEntries?: Entry[];
}

const HIDDEN_RARITIES = new Set(["none", "unknown", "unknown (magic)", "varies"]);
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

/** Templates for when the content has no `itemProperty` entries (the sample data). */
const FALLBACK_TEMPLATES: Record<string, string> = {
  A: "{{prop_name}} ({{item.range}} ft.)",
  AF: "{{prop_name}} ({{item.range}} ft.)",
  T: "{{prop_name}} ({{item.range}} ft.)",
  V: "{{prop_name}} ({{item.dmg2}})",
  RLD: "{{prop_name}} ({{item.reload}} shots)",
};

export function titleCase(text: string): string {
  return text.replace(/[A-Za-z][\w'’-]*/g, (word, offset: number) =>
    offset > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1),
  );
}

function upperFirst(text: string): string {
  return text.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** "V|XPHB" -> ["V", "XPHB"], defaulting the source. */
function unpackUid(uid: string, defaultSource: string): [string, string] {
  const [abbreviation, source] = uid.split("|");
  return [abbreviation.trim(), source?.trim() || defaultSource];
}

function findItemType(index: ContentIndex, uid: string): ImportedEntity | undefined {
  const [abbreviation, source] = unpackUid(uid, "PHB");
  return (
    index.find("itemType", { abbreviation, source }) ?? index.find("itemType", { abbreviation, source: "PHB" })
  );
}

function findProperty(index: ContentIndex, uid: string): ImportedEntity | undefined {
  const [abbreviation, source] = unpackUid(uid, "PHB");
  return (
    index.find("itemProperty", { abbreviation, source }) ??
    index.find("itemProperty", { abbreviation, source: "PHB" })
  );
}

function findMastery(index: ContentIndex, uid: string): ImportedEntity | undefined {
  const [name, source] = unpackUid(uid, "XPHB");
  return index.get("itemMastery", name, source) ?? index.findByName("itemMastery", name);
}

const uidOf = (p: ItemPropertyRef): string => (typeof p === "string" ? p : p.uid);

/** A property's display name: its own `name`, else its first entry's ("Versatile"). */
function propertyName(entity: ImportedEntity | undefined, uid: string): string {
  const fromEntries = (entity?.entries as { name?: string }[] | undefined)?.[0]?.name;
  const own = entity && entity.name !== entity.abbreviation ? entity.name : undefined;
  const abbreviation = uid.split("|")[0];
  return own ?? fromEntries ?? PROPERTY_LABELS[abbreviation] ?? abbreviation;
}

/** Fill `{{item.dmg2}}`-style placeholders the way 5eTools' `applyTemplate` does. */
function applyTemplate(text: string, item: ItemExtras, custom: Record<string, string> = {}): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim();
    if (k in custom) return custom[k];
    if (!k.startsWith("item.")) return match;
    let value: unknown = item;
    for (const part of k.slice(5).split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
    return value == null ? "" : String(value);
  });
}

/** Apply templates to every string in an entry tree. */
function templateEntries(entries: unknown, item: ItemExtras): Entry[] {
  const walk = (e: unknown): unknown => {
    if (typeof e === "string") return applyTemplate(e, item);
    if (Array.isArray(e)) return e.map(walk);
    if (e && typeof e === "object") {
      return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === "type" ? v : walk(v)]));
    }
    return e;
  };
  return (walk(entries ?? []) as Entry[]) ?? [];
}

/** A rules entity's text: `entries`, or `entriesTemplate` filled in for this item. */
function rulesEntries(entity: ImportedEntity | undefined, item: ItemExtras): Entry[] {
  if (!entity) return [];
  if (Array.isArray(entity.entriesTemplate)) return templateEntries(entity.entriesTemplate, item);
  return Array.isArray(entity.entries) ? (entity.entries as Entry[]) : [];
}

/** Lowercase type name for a type uid: "M|XPHB" -> "melee weapon". */
function typeName(index: ContentIndex, uid: string): string {
  const entity = findItemType(index, uid);
  const code = uid.split("|")[0];
  const name = entity && entity.name !== entity.abbreviation ? entity.name : TYPE_LABELS[code];
  return (name ?? code).toLowerCase();
}

/** 5eTools' `getRenderableTypeEntriesMeta`: what the item is, and its sub-categories. */
function typeParts(item: ItemExtras, index: ContentIndex): { type: string; subtype: string } {
  const types: string[] = [];
  const subtypes: string[] = [];
  const textTypes: string[] = [];
  const baseName = item.baseItem ? titleCase(item.baseItem.split("|")[0]) : undefined;
  let showingBase = false;

  if (item.wondrous) {
    types.push(`wondrous item${item.tattoo ? " (tattoo)" : ""}`);
    textTypes.push("wondrous item");
  }
  if (item.staff) {
    types.push("staff");
    textTypes.push("staff");
  }
  if (item.ammo) {
    types.push("ammunition");
    textTypes.push("ammunition");
  }
  if (item.age) {
    subtypes.push(item.age);
    textTypes.push(item.age);
  }
  if (item.weaponCategory) {
    types.push(`weapon${baseName ? ` (${baseName})` : ""}`);
    subtypes.push(`${item.weaponCategory} weapon`);
    textTypes.push(`${item.weaponCategory} weapon`);
    showingBase = true;
  }
  const isMelee = (t?: string) => itemTypeCode(t) === "M";
  if (item.staff && !isMelee(item.type) && !isMelee(item.typeAlt)) {
    subtypes.push("melee weapon");
    textTypes.push("melee weapon");
  }
  for (const uid of [item.type, item.typeAlt]) {
    if (!uid) continue;
    const full = typeName(index, uid);
    const isSub =
      (textTypes.some((t) => t.includes("weapon")) && full.includes("weapon")) ||
      (textTypes.some((t) => t.includes("armor")) && full.includes("armor"));
    const into = isSub ? subtypes : types;
    if (!showingBase && baseName) into.push(`${full} (${baseName})`);
    else if (itemTypeCode(uid) === "S") into.push("armor (shield)");
    else into.push(full);
    textTypes.push(full);
  }
  if (item.firearm) subtypes.push("firearm");
  if (item.poison) types.push(`poison${item.poisonTypes?.length ? ` (${item.poisonTypes.join(" or ")})` : ""}`);
  return { type: types.join(", "), subtype: subtypes.join(", ") };
}

function attunementText(reqAttune: boolean | string | undefined): string {
  if (reqAttune == null || reqAttune === false) return "";
  if (reqAttune === true) return "(Requires Attunement)";
  if (reqAttune === "optional") return "(Attunement Optional)";
  return `(Requires Attunement ${reqAttune})`;
}

/** "3 lb.", "½ lb.", "4 oz." — 5eTools' `itemWeightToFull`. */
export function itemWeightText(item: { weight?: number; weightNote?: string }): string {
  const w = item.weight;
  if (!w) return "";
  const note = item.weightNote ? ` ${item.weightNote}` : "";
  const whole = Math.floor(w);
  const vulgar: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
  const fraction = vulgar[String(Math.round((w - whole) * 100) / 100)];
  if (w === whole) return `${w} lb.${note}`;
  if (fraction) return `${whole || ""}${fraction} lb.${note}`;
  return w < 1 ? `${Math.round(w * 16 * 100) / 100} oz.${note}` : `${Math.round(w * 100) / 100} lb.${note}`;
}

/** AC part of the damage line: "AC 12 + Dex", "AC 14 + Dex (max 2)", "AC +2". */
function armorText(item: ItemExtras): string[] {
  const code = itemTypeCode(item.type);
  const parts: string[] = [];
  if (item.ac != null) {
    const dexMax = code === "MA" && item.dexterityMax === undefined ? 2 : item.dexterityMax;
    const addDex = item.dexterityMax !== undefined || !(code === "HA" || code === "S");
    parts.push(`AC ${code === "S" ? "+" : ""}${item.ac}${addDex ? ` + Dex${dexMax ? ` (max ${dexMax})` : ""}` : ""}`);
  }
  if (item.acSpecial != null) parts.push(item.ac != null ? item.acSpecial : `AC ${item.acSpecial}`);
  return parts;
}

/** "Finesse, Light, Thrown (Range 20/60 ft.)" — each property's template, sorted by name. */
function propertiesText(item: ItemExtras, index: ContentIndex): string {
  const used = { dmg2: false, range: false };
  const dice = (d?: string) => (d ? `{@damage ${d}}` : "");
  const rendered = (item.property ?? [])
    .map((p) => {
      const uid = uidOf(p);
      const entity = findProperty(index, uid);
      return { p, uid, entity, name: propertyName(entity, uid) };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ p, uid, entity, name }) => {
      const note = typeof p === "object" && p.note ? ` (${p.note})` : "";
      const template =
        typeof entity?.template === "string" ? entity.template : entity ? undefined : FALLBACK_TEMPLATES[uid.split("|")[0]];
      if (!template) return `${name}${note}`;
      if (template.includes("{{item.dmg2}}")) used.dmg2 = true;
      if (template.includes("{{item.range}}")) used.range = true;
      const ammo = item.ammoType ? `{@item ${titleCase(item.ammoType)}}` : "";
      const text = applyTemplate(template, item, {
        prop_name: name,
        prop_name_lower: name.toLowerCase(),
        "item.dmg1": dice(item.dmg1),
        "item.dmg2": dice(item.dmg2),
        "item.ammoType": ammo,
      });
      // "(Range 80/320 ft.; )" when the ammunition type is unknown.
      return `${text.replace(/; \)/, ")")}${note}`;
    });
  if (!used.dmg2 && item.dmg2) rendered.unshift(`alt. ${dice(item.dmg2)}`);
  if (!used.range && item.range) rendered.push(`range ${item.range} ft.`);
  return upperFirst(rendered.join(", "));
}

/** Items whose text is a shared template: `"{#itemEntry Absorbing Tattoo|TCE}"`. */
function expandItemEntries(entries: Entry[] | undefined, item: ItemExtras, index: ContentIndex): Entry[] {
  return (entries ?? []).flatMap((e) => {
    const m = typeof e === "string" ? /^\{#itemEntry ([^}|]+)(?:\|([^}]+))?\}$/.exec(e.trim()) : null;
    if (!m) return [e];
    const entity = index.get("itemEntry", m[1], m[2] ?? "DMG") ?? index.findByName("itemEntry", m[1]);
    return entity ? rulesEntries(entity, item) : [];
  });
}

/** XGE-style extra text for a whole item type (`itemTypeAdditionalEntries`). */
function typeAdditionalEntries(item: ItemExtras, index: ContentIndex): Entry[] {
  if (!item.type) return [];
  const [abbreviation, source] = unpackUid(item.type, "PHB");
  const uid = `${abbreviation}|${source}`.toLowerCase();
  return index
    .list("itemTypeAdditionalEntries")
    .filter((e) => typeof e.appliesTo === "string" && unpackUid(e.appliesTo, "PHB").join("|").toLowerCase() === uid)
    .flatMap((e) => (Array.isArray(e.entries) ? (e.entries as Entry[]) : []));
}

/** The card's two italic lines: "Wondrous Item, Rare (Requires Attunement)" and "Martial Weapon, Melee Weapon". */
export function itemTypeLines(item: Item, index: ContentIndex): { typeLine: string; subtypeLine: string } {
  const it = item as ItemExtras;
  const { type, subtype } = typeParts(it, index);
  const rarity = it.rarity && !HIDDEN_RARITIES.has(it.rarity) ? it.rarity : "";
  const typeRarity = [type === "other" ? "" : type, rarity].filter(Boolean).map(titleCase).join(", ");
  return {
    typeLine: [typeRarity, attunementText(it.reqAttune)].filter(Boolean).join(" "),
    subtypeLine: titleCase(subtype),
  };
}

export function itemCard(item: Item, index: ContentIndex): ItemCardData {
  const it = item as ItemExtras;
  const code = itemTypeCode(it.type);
  const { typeLine, subtypeLine } = itemTypeLines(item, index);

  const damage = it.dmg1
    ? [`{@damage ${it.dmg1}}`, it.dmgType ? titleCase(DAMAGE_TYPES[it.dmgType] ?? it.dmgType) : ""]
        .filter(Boolean)
        .join(" ")
    : "";
  const statParts = [
    ...armorText(it),
    damage,
    it.speed != null ? `Speed: ${it.speed} ft.` : "",
    it.carryingCapacity ? `Carrying Capacity: ${it.carryingCapacity} lb.` : "",
  ].filter(Boolean);
  const masteries = (it.mastery ?? []).map((m) =>
    typeof m === "string" ? m : ((m as { uid?: string }).uid ?? ""),
  ).filter(Boolean);
  const stats = [
    statParts.join(", "),
    propertiesText(it, index),
    masteries.length ? `Mastery: ${masteries.map((m) => m.split("|")[0]).join(", ")}` : "",
  ].filter(Boolean);

  // Rules text in 5eTools' order: type, properties, armor notes, mastery.
  const notes: Entry[] = [];
  if (it.type) notes.push(...rulesEntries(findItemType(index, it.type), it));
  for (const p of it.property ?? []) notes.push(...rulesEntries(findProperty(index, uidOf(p)), it));
  if ((code === "LA" || code === "MA" || code === "HA") && it.stealth) {
    notes.push("The wearer has Disadvantage on Dexterity ({@skill Stealth}) checks.");
  }
  if (code === "HA" && it.strength) {
    notes.push(`If the wearer has a Strength score lower than ${it.strength}, their speed is reduced by 10 feet.`);
  }
  for (const uid of masteries) {
    const mastery = findMastery(index, uid);
    const entries = rulesEntries(mastery, it);
    if (mastery && entries.length) notes.push({ type: "entries", name: `Mastery: ${mastery.name}`, entries });
  }

  const value = it.value != null && it.value > 0 ? formatValue(it.value) : "";
  return {
    typeLine,
    subtypeLine,
    costWeight: [value, itemWeightText(it)].filter(Boolean).join(", "),
    stats,
    entries: expandItemEntries(it.entries, it, index),
    notes,
    additional: [...(it.additionalEntries ?? []), ...typeAdditionalEntries(it, index)],
    sourceTitle: index.sourceTitle(it.source),
    page: typeof it.page === "number" ? it.page : undefined,
  };
}
