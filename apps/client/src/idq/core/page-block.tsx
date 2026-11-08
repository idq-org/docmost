import type { ReactNode } from "react";
import { Paper } from "@mantine/core";
import clsx from "clsx";
import classes from "./page-block.module.css";

/**
 * A box under the page title, aligned with the page text and left out when
 * the page is printed (print-hide is Docmost's class for that).
 */
export function PageBlock({ children }: { children: ReactNode }) {
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={clsx("print-hide", classes.block)}
    >
      {children}
    </Paper>
  );
}
