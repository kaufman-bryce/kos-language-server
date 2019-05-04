import { Position, Range, Location } from 'vscode-languageserver';

/**
 * Is this position after the next
 * @param pos1 the target position
 * @param pos2 the other position
 */
export const positionAfter = (pos1: Position, pos2: Position): boolean => {
  if (pos1.line > pos2.line) {
    return true;
  }

  if (pos1.line === pos2.line) {
    if (pos1.character > pos2.character) {
      return true;
    }
  }

  return false;
};

/**
 * Is this position equal to or after the next
 * @param pos1 the target position
 * @param pos2 the other position
 */
export const positionAfterEqual = (pos1: Position, pos2: Position): boolean => {
  return positionAfter(pos1, pos2) || positionEqual(pos1, pos2);
};

/**
 * Is this position before the next
 * @param pos1 the target position
 * @param pos2 the other position
 */
export const positionBefore = (pos1: Position, pos2: Position): boolean => {
  if (pos1.line < pos2.line) {
    return true;
  }

  if (pos1.line === pos2.line) {
    if (pos1.character < pos2.character) {
      return true;
    }
  }

  return false;
};

/**
 * Is this position equal or before the next
 * @param pos1 the target position
 * @param pos2 the other position
 */
export const positionBeforeEqual = (
  pos1: Position,
  pos2: Position,
): boolean => {
  return positionBefore(pos1, pos2) || positionEqual(pos1, pos2);
};

/**
 * Is this position equal to the next
 * @param pos1 the target position
 * @param pos2 the other position
 */
export const positionEqual = (pos1: Position, pos2: Position): boolean => {
  return pos1.line === pos2.line && pos1.character === pos2.character;
};

/**
 * Is this range equal to the next
 * @param range1 the target range
 * @param range2 the other range
 */
export const rangeEqual = (range1: Range, range2: Range): boolean => {
  if (!positionEqual(range1.start, range2.start)) return false;
  return positionEqual(range1.end, range2.end);
};

/**
 * Does this range contain this position
 * @param range the target range
 * @param pos the query position
 */
export const rangeContains = (range: Range, pos: Position): boolean => {
  if (pos.line < range.start.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) {
    return false;
  }
  if (pos.line > range.end.line) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) {
    return false;
  }

  return true;
};

/**
 * Is this range before this position
 * @param range the target range
 * @param pos the query position
 */
export const rangeBefore = (range: Range, pos: Position): boolean => {
  if (pos.line > range.end.line) return true;
  if (pos.line === range.end.line) {
    if (pos.character > range.end.character) return true;
  }

  return false;
};

/**
 * Is this range after this position
 * @param range the target range
 * @param pos the query position
 */
export const rangeAfter = (range: Range, pos: Position): boolean => {
  if (pos.line < range.start.line) return true;
  if (pos.line === range.start.line) {
    if (pos.character < range.start.character) return true;
  }

  return false;
};

/**
 * Does this range intersect the next
 * @param range1 the target range
 * @param range2 the other range
 */
export const rangeIntersection = (range1: Range, range2: Range): boolean => {
  if (rangeAfter(range1, range2.end)) return false;
  if (rangeBefore(range2, range2.end)) return false;
  return true;
};

/**
 * Generate a human readable string of the range
 * @param range range to string
 */
export const rangeToString = (range: Range): string => {
  const sameLine = range.start.line === range.end.line;
  if (range.start.line === range.end.line) {
    const sameCharacter = range.start.character === range.end.character;
    const character =
      sameLine && sameCharacter
        ? (range.start.character + 1).toString()
        : `${range.start.character + 1}-${range.end.character + 1}`;

    return `line: ${range.start.line + 1} character: ${character}`;
  }

  return `${positionToString(range.start)} to ${positionToString(range.end)}`;
};

/**
 * Generate a human readable string of this position
 * @param pos position to string
 */
export const positionToString = (pos: Position): string => {
  return `line: ${pos.line + 1} character: ${pos.character + 1}`;
};

/**
 * Binary search a collection of ordered ranges
 * @param ranges sorted ranges to search
 * @param pos query position
 */
export const binarySearch = <T extends Range>(
  ranges: T[],
  pos: Position,
): Maybe<T> => {
  const index = binarySearchIndex(ranges, pos);
  return Array.isArray(index) ? undefined : ranges[index];
};

/**
 * Binary search right on a collection of ordered ranges
 * @param ranges sorted ranges to search
 * @param pos query position
 */
export const binaryRight = <T extends Range>(
  ranges: T[],
  pos: Position,
): Maybe<T> => {
  if (rangeAfter(ranges[0], pos)) {
    return undefined;
  }
  const index = binarySearchIndex(ranges, pos);
  return Array.isArray(index) ? ranges[index[1]] : ranges[index];
};

/**
 * Binary search left on a collection of ordered ranges
 * @param ranges sorted ranges to search
 * @param pos query position
 */
export const binaryLeft = <T extends Range>(
  ranges: T[],
  pos: Position,
): Maybe<T> => {
  if (ranges.length === 0 || rangeBefore(ranges[rangeAfter.length - 1], pos)) {
    return undefined;
  }
  const index = binarySearchIndex(ranges, pos);

  return Array.isArray(index) ? ranges[index[0]] : ranges[index];
};

/**
 * Binary search with provided function to generate a range
 * @param ranges sorted collection of items that can generate a range
 * @param pos query position
 * @param key key function to generate a range
 */
export const binaryRightKey = <T>(
  ranges: T[],
  pos: Position,
  key: (range: T) => Range,
): Maybe<T> => {
  if (ranges.length === 0 || rangeAfter(key(ranges[0]), pos)) {
    return undefined;
  }
  const index = binarySearchKeyIndex(ranges, pos, key);

  return Array.isArray(index) ? ranges[index[1]] : ranges[index];
};

/**
 * Binary search for index with provided function to generate a range.
 * Returns array if between ranges
 * @param ranges ordered collection of ranges
 * @param pos query position
 */
export const binarySearchIndex = <T extends Range>(
  ranges: T[],
  pos: Position,
): number | [number, number] => {
  let left = 0;
  let right = ranges.length - 1;

  while (left <= right) {
    const mid = Math.floor((right + left) / 2);
    if (rangeBefore(ranges[mid], pos)) {
      left = mid + 1;
    } else if (rangeAfter(ranges[mid], pos)) {
      right = mid - 1;
    } else if (rangeContains(ranges[mid], pos)) {
      return mid;
    } else {
      return [left, right];
    }
  }

  return [left, right];
};

/**
 * Binary search for index of matching item using . Returns array if between ranges
 * @param ranges ordered collection of ranges
 * @param pos query position
 */
export const binarySearchKeyIndex = <T>(
  ranges: T[],
  pos: Position,
  key: (range: T) => Range,
): number | [number, number] => {
  let left = 0;
  let right = ranges.length - 1;

  while (left <= right) {
    const mid = Math.floor((right + left) / 2);
    if (rangeBefore(key(ranges[mid]), pos)) {
      left = mid + 1;
    } else if (rangeAfter(key(ranges[mid]), pos)) {
      right = mid - 1;
    } else if (rangeContains(key(ranges[mid]), pos)) {
      return mid;
    } else {
      return [left, right];
    }
  }

  return [left, right];
};

/**
 * Are these locations equal
 * @param loc1 target location
 * @param loc2 other location
 */
export const locationEqual = (loc1: Location, loc2: Location): boolean => {
  if (loc1.uri !== loc2.uri) return false;
  return rangeEqual(loc1.range, loc2.range);
};
