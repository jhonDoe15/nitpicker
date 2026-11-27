import got from "got";
import nodeFetch from "node-fetch";
export const a = () => got("https://example.com/a");
export const b = () => nodeFetch("https://example.com/b");
export const c = () => fetch("https://example.com/c");
