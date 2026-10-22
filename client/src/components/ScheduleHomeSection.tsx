import { Link } from "react-router-dom";

export default function ScheduleHomeSection({ isBrand }: { isBrand: boolean }) {
  return (
    <li>
      <Link to="/schedule">
        Schedule
        <small>
          Visit calendar with your {isBrand ? "creators" : "brands"}
        </small>
      </Link>
    </li>
  );
}
