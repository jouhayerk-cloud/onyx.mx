import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { escapeLikeValue } from "./likeEscape.ts";

const BS = String.fromCharCode(92);

Deno.test("escapeLikeValue leaves a plain email alone", () => {
    assertEquals(escapeLikeValue("ana.perez@onyx.mx"), "ana.perez@onyx.mx");
});

Deno.test("escapeLikeValue escapes underscore, percent and backslash", () => {
    assertEquals(
        escapeLikeValue("a_b%c" + BS + "d@x.com"),
        "a" + BS + "_b" + BS + "%c" + BS + BS + "d@x.com",
    );
});

Deno.test("escapeLikeValue makes a wildcard email match only itself", () => {
    assertEquals(escapeLikeValue("admin_@onyx.mx"), "admin" + BS + "_@onyx.mx");
});
