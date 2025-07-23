export function superJoin(
  collection: string[],
  beginString: string = "\n  - ",
  joinString: string = "\n  - ",
  endString: string = ""
): string {
  if (collection.length === 0) {
    return `{beginString}None`
  }
  if (collection.length === 1) {
    return `${beginString}${collection[0]}`
  }

  const joined = collection.join(joinString)
  return beginString + joined + endString
}
