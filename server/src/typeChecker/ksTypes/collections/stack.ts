import {
  createParametricType,
  createParametricArgSuffixType,
  mapTypes,
  noMap,
  createArgSuffixType,
} from '../../typeCreators';
import { enumerableType } from './enumerable';
import { voidType } from '../primitives/void';

export const stackType = createParametricType('stack', ['T']);
stackType.addSuper(mapTypes(stackType, enumerableType));

const copySuffix = createParametricArgSuffixType('copy', ['T'], stackType);
const pushSuffix = createParametricArgSuffixType('push', ['T'], voidType, 'T');
const popSuffix = createParametricArgSuffixType('pop', ['T'], 'T');
const peekSuffix = createParametricArgSuffixType('peek', ['T'], 'T');

stackType.addSuffixes(
  mapTypes(stackType, copySuffix),
  mapTypes(stackType, pushSuffix),
  mapTypes(stackType, popSuffix),
  mapTypes(stackType, peekSuffix),
  noMap(createArgSuffixType('clear', voidType)),
);
