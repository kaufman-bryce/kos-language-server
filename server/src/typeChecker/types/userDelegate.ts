import { ArgumentType } from './types';
import { createStructureType } from "../typeCreators";
import { addPrototype } from '../typeUitlities';
import { delegateType } from './primitives/delegate';

export const userDelegateType: ArgumentType = createStructureType('userDelegate');
addPrototype(userDelegateType, delegateType);
