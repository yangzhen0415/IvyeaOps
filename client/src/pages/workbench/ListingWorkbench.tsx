import type { ComponentType } from "react";
import _ListingGenerator from "./ListingGenerator";

const ListingGenerator = _ListingGenerator as ComponentType<Record<string, never>>;

export default function ListingWorkbench() {
  return <ListingGenerator />;
}
