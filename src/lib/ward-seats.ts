// Leeds City Council has three councillor positions in each ward. A normal
// poll fills one; a poll with an additional vacancy may fill two.
export const LEEDS_WARD_SEATS = 3;

export function seatsFilledLabel(count: number) {
  return `${count} of ${LEEDS_WARD_SEATS} ward seats`;
}
