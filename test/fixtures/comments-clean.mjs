#!/usr/bin/env node
/** @type {import("node:http").Server | null} */
export let server = null;

/**
 * @param {number} n
 * @returns {number}
 */
export function twice(n) {
  return n * 2;
}
