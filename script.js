/*
    Daily Activity Display

    Main application logic:
    - Loads activities from activities.json
    - Determines active activities
    - Handles daily, weekly and one-time activities
    - Handles effective date ranges
    - Displays multiple simultaneous activities
    - Alternates clock and activity screens
*/


let activities = [];

let showClock = true;


/*
    Load activity schedule
*/

async function loadActivities() {

    try {

        const response = await fetch("activities.json");

        activities = await response.json();

        refreshDisplay();

    }

    catch (error) {

        document.getElementById("activityHeading").innerHTML =
            "<div class='none'>Unable to load activities</div>";

        console.error("Activity loading error:", error);

    }

}



/*
    Display current date and time
*/

function updateClock(now) {


    const weekday =
        now.toLocaleDateString(
            "en-US",
            { weekday:"long" }
        );


    const month =
        now.toLocaleDateString(
            "en-US",
            { month:"long" }
        );


    document.getElementById("dateHeading").innerHTML =
    `${weekday} - ${month} ${now.getDate()}<br>${now.getFullYear()}`;



    const hour = now.getHours();

    const minute = now.getMinutes();


    const hour12 = hour % 12 || 12;


    let period;


    if (hour >= 5 && hour < 12) {

        period = "morning";

    }

    else if (hour >= 12 && hour < 16) {

        period = "afternoon";

    }

    else if (hour >= 16 && hour < 20) {

        period = "evening";

    }

    else {

        period = "night";

    }


    document.getElementById("timeHeading").textContent =
        `${hour12}:${String(minute).padStart(2,"0")} in the ${period}`;

}



/*
    Check if activity applies today
*/

function activityAppliesToday(activity, now) {


    const today =
        now.getFullYear() +
        "-" +
        String(now.getMonth()+1).padStart(2,"0") +
        "-" +
        String(now.getDate()).padStart(2,"0");



    switch(activity.type) {


        case "daily":

            return true;



        case "weekly":

            return activity.days.includes(now.getDay());



        case "once":

            return activity.date === today;



        default:

            return false;

    }

}



/*
    Check effective date range
*/

function withinEffectiveDates(activity, now) {


    const today =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );



    if (activity.effectiveFrom) {


        const from = new Date(activity.effectiveFrom);


        if (today < from)
            return false;

    }



    if (activity.effectiveTo) {


        const to = new Date(activity.effectiveTo);


        if (today > to)
            return false;

    }


    return true;

}



/*
    Find all currently active activities
*/

function getCurrentActivities(now) {


    const matches = [];



    for (const activity of activities) {



        if (!activityAppliesToday(activity, now))
            continue;



        if (!withinEffectiveDates(activity, now))
            continue;



        const parts =
            activity.start.split(":");



        const start = new Date(now);


        start.setHours(
            Number(parts[0]),
            Number(parts[1]),
            0,
            0
        );



        const windowStart =
            new Date(
                start.getTime()
                -
                activity.lead * 60000
            );



        const windowEnd =
            new Date(
                start.getTime()
                +
                activity.lag * 60000
            );



        if (
            now >= windowStart &&
            now <= windowEnd
        ) {



            const difference =
                Math.round(
                    (start.getTime() - now.getTime())
                    /
                    60000
                );



            let status;



            if (difference > 1) {

                status =
                    `Starts in ${difference} minutes`;

            }

            else if (difference === 1) {

                status =
                    "Starts in 1 minute";

            }

            else if (difference === 0) {

                status =
                    "Starting now";

            }

            else if (difference === -1) {

                status =
                    "Started 1 minute ago";

            }

            else {

                status =
                    `Started ${Math.abs(difference)} minutes ago`;

            }



            matches.push({

                ...activity,

                status: status

            });

        }

    }



    /*
        Always display earliest start time first
    */

    matches.sort(
        (a,b) =>
            a.start.localeCompare(b.start)
    );



    return matches;

}



/*
    Display activities
*/

function updateActivities(now) {


    const current =
        getCurrentActivities(now);



    const container =
        document.getElementById("activityHeading");



    if (current.length === 0) {


        container.innerHTML =
            "<div class='none'>No Activities Scheduled</div>";


        return;

    }



    let html = "";



    current.forEach(activity => {



        const priority =
            activity.priority || "normal";



        html += `

        <div class="activityCard priority-${priority}">


            <div class="activityTime">

                ${activity.start}

            </div>


            <div class="activityStatus">

                ${activity.status}

            </div>


            <div class="activityText">


                <strong>
                    ${activity.title || ""}
                </strong>

                <br>


                ${activity.text.replaceAll(";", "<br>")}


            </div>


        </div>

        `;


    });



    container.innerHTML = html;


}



/*
    Main refresh routine

    Runs every 30 seconds
*/

function refreshDisplay() {


    const now = new Date();



    updateClock(now);


    updateActivities(now);



    document.getElementById("clockPanel").style.display =
        showClock ? "block" : "none";



    document.getElementById("activityPanel").style.display =
        showClock ? "none" : "block";



    showClock = !showClock;


}



/*
    Start application
*/

loadActivities();



setInterval(
    refreshDisplay,
    30000
);