import { describe, expect, it } from "vitest";
import {
  ImportFileError,
  parseCsv,
  planImport,
  readImportRows,
  resolveProvince,
  resolveVisibility,
} from "./csv-import";
import { IAdminMember } from "../types";

describe("parseCsv", () => {
  it("reads Italian Excel files: semicolons, BOM, CRLF", () => {
    expect(parseCsv("﻿email;provincia\r\nada@x.it;BO\r\n")).toEqual([
      ["email", "provincia"],
      ["ada@x.it", "BO"],
    ]);
  });

  it("reads commas, quotes and empty lines", () => {
    expect(
      parseCsv(
        'email,provincia,note\n"a@x.it","Forlì, Cesena","say ""hi"""\n\n',
      ),
    ).toEqual([
      ["email", "provincia", "note"],
      ["a@x.it", "Forlì, Cesena", 'say "hi"'],
    ]);
  });
});

describe("resolveProvince", () => {
  it.each([
    ["BO", "BO"],
    [" bo ", "BO"],
    ["Bologna", "BO"],
    ["forli-cesena", "FC"],
    ["Forlì Cesena", "FC"],
    ["Cesena", "FC"],
    ["Reggio nell'Emilia", "RE"],
    ["Reggio Emilia", "RE"],
    ["Reggio Calabria", "RC"],
    ["L'Aquila", "AQ"],
    ["Monza", "MB"],
    ["Roma", "RM"],
  ])("%s → %s", (value, code) => {
    expect(resolveProvince(value)).toBe(code);
  });

  it.each(["", "XX", "Reggio", "Via Roma 1, Bologna"])(
    'does not guess "%s"',
    (value) => {
      expect(resolveProvince(value)).toBeNull();
    },
  );
});

describe("resolveVisibility", () => {
  it("reads Italian and English words", () => {
    expect(resolveVisibility("Con nome", "count")).toBe("named");
    expect(resolveVisibility("named", "count")).toBe("named");
    expect(resolveVisibility("senza nome", "named")).toBe("count");
    expect(resolveVisibility("count", "named")).toBe("count");
  });

  it("uses the default only for empty cells", () => {
    expect(resolveVisibility("", "count")).toBe("count");
    expect(resolveVisibility(undefined, "named")).toBe("named");
    expect(resolveVisibility("no", "count")).toBeNull();
  });
});

describe("readImportRows", () => {
  it("finds the columns by name, in any order", () => {
    expect(
      readImportRows(
        "Nome;Provincia;E-mail;Visibilità\nAda;BO;Ada@X.it;nome\n",
      ),
    ).toEqual([
      { line: 2, email: "ada@x.it", province: "BO", visibility: "nome" },
    ]);
  });

  it("needs the email and province columns", () => {
    expect(() => readImportRows("nome;comune\nAda;Imola\n")).toThrow(
      ImportFileError,
    );
  });
});

describe("planImport", () => {
  const member = (
    id: string,
    email: string,
    chosenBy: IAdminMember["chosenBy"] = null,
  ): IAdminMember => ({
    id,
    email,
    name: id,
    avatarUrl: null,
    provinceCode: chosenBy ? "RM" : null,
    visibility: chosenBy ? "count" : "hidden",
    chosenBy,
    setByName: null,
    updatedAt: null,
  });
  const members = [
    member("ada", "ada@x.it"),
    member("bruno", "bruno@x.it"),
    member("dario", "dario@x.it", "member"),
    member("elena", "elena@x.it"),
    member("fabio", "fabio@x.it", "admin"),
  ];
  const rows = readImportRows(
    [
      "email;provincia;visibilita",
      "ada@x.it;Bologna;con nome",
      "bruno@x.it;FC;",
      "dario@x.it;BO;",
      "nobody@x.it;BO;nome",
      "elena@x.it;Atlantide;nome",
      "ada@x.it;RM;nome",
      "fabio@x.it;NA;boh",
      ";BO;",
    ].join("\n"),
  );

  it("fills in valid rows and says why it leaves out the others", () => {
    const plan = planImport(rows, members, "count");
    expect(
      plan.changes.map((c) => [
        c.line,
        c.member.id,
        c.provinceCode,
        c.visibility,
      ]),
    ).toEqual([
      [2, "ada", "BO", "named"],
      [3, "bruno", "FC", "count"],
    ]);
    expect(plan.skips.map((s) => [s.line, s.reason, s.value])).toEqual([
      [4, "chosen-by-member", undefined],
      [5, "no-account", undefined],
      [6, "unknown-province", "Atlantide"],
      [7, "repeated", undefined],
      [8, "unknown-visibility", "boh"],
      [9, "no-email", undefined],
    ]);
  });

  it("can change what an admin set", () => {
    const plan = planImport(
      readImportRows("email;provincia\nfabio@x.it;NA\n"),
      members,
      "named",
    );
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      provinceCode: "NA",
      visibility: "named",
    });
  });
});
