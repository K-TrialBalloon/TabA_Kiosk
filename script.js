/*
    Daily Activity Display

    Main application logic:
    - Loads activities from activities.json
    - Determines active,upcoming and special activities
    - Handles daily, weekly and one-time activities
    - Handles effective date ranges
    - Toggles between clock and activity screens
    - Dims screen gradually as sleep time approaches and brightens as wake-up time nears
    - Individual messages can be marked to be spoken during subset of display window  
    - Messages can be prioritized 
*/

const MAX_DIM = 0.85;          // Maximum darkness (0.0 - 1.0) for night overlay function
const UPCOMING_MINUTES = 30;   // Lead Time to decide if an activity is upcoming. 
const AUDIO = 'ON';            // Master variable to control message announcement

let activities = [];
let showClock = true;
let activityRefreshTimer = null;


/*
    Load activity schedule
*/

async function loadActivities(refreshHours = 0) {

    try {

        const response = await fetch(
               `activities.json?ts=${Date.now()}`,
                 {
                     cache: "no-store"
                 }
               );

        activities = await response.json();

        refreshDisplay();

    }

    catch (error) {

        document.getElementById("activityHeading").innerHTML =
            "<div class='none'>Unable to load activities</div>";
        console.error("Activity loading error:", error);

    }
    // Set up automatic refresh only if requested
    if (refreshHours > 0 && activityRefreshTimer === null) {
        activityRefreshTimer = setInterval(() => {
            loadActivities(0);                           // Reload once; don't create another timer
        }, refreshHours * 60 * 60 * 1000);
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
    `${weekday} - ${month} ${now.getDate()}<br>${now.getFullYear()}<br>`;


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
    Sometimes entries can have a start and end date when they are considered active
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
    Find all currently eligible activities whose display window is active
    EXCLUDE anything that does not have a catg=[active, routine]
*/

function getCurrentActivities(now) {


    const matches = [];


    for (const activity of activities) {
        
        
        if (activity.catg !== "routine" && activity.catg !== "activity")
            continue;


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
            
            speakAudio = false;
            /* We want to provide audio feedback only when the message display is active and only for messages
               with an audioline that are within 8 to 3 mins of the actual entry sart time */
            
            if (AUDIO === 'ON' && 
                showClock !== true && 
                Object.hasOwn(activity, 'audioline') && 
                difference <= 8 && 
                difference >= 3) {
                speakAudio = true;
                }

            matches.push({

                ...activity,

                status: status,
                speakAudio: speakAudio

            });

        }

    }


    /*
        Always display earliest start time first. Process catg="activity" before catg="routine" or "special"
    */

    matches.sort(
        (a,b) =>
            a.catg.localeCompare(b.catg) ||
            a.start.localeCompare(b.start)
    );

    return matches;

}

/*
    Find the next upcoming activity

    An activity is considered upcoming when its display-window
    start time is no more than UPCOMING_MINUTES in the future.

    The activity's display-window start is:
        activity start time - lead time

    Routine and special category activity entries will not be considered
*/

function getUpcomingActivities(now) {

    const matches = [];

    for (const activity of activities) {

        if (activity.catg !== "activity")
            continue;
        
        if (!activityAppliesToday(activity, now))
            continue;

        if (!withinEffectiveDates(activity, now))
            continue;

        const parts = activity.start.split(":");

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

        /*
            How many minutes until the activity's
            display window begins?
        */

        const minutesUntilWindow =
            (windowStart.getTime() - now.getTime())
            / 60000;


        /*
            Only include activities whose display window
            begins within the upcoming threshold.

            > 0  = window has not started yet
            <= X = window starts within X minutes
        */

        if (
            minutesUntilWindow > 0 &&
            minutesUntilWindow <= UPCOMING_MINUTES
        ) {

            matches.push({
                ...activity,
                windowStart: windowStart,
                minutesUntilWindow: Math.ceil(minutesUntilWindow)
            });

        }

    }


    /*
        Earliest display-window start first
    */

    matches.sort(
        (a, b) =>
            a.windowStart.getTime() -
            b.windowStart.getTime()
    );

    return matches;

}

/*
    Get special category activities. Usually will display a Web page generated for special events
    Be aware that this will OVERRIDE all other scheduled messages
*/

function getCurrentSpecialPages(now) {

    const matches = [];

    for (const activity of activities) {

        if (activity.catg !== "special")
            continue;

        if (!activityAppliesToday(activity, now))
            continue;

        if (!withinEffectiveDates(activity, now))
            continue;

        const parts = activity.start.split(":");

        const start = new Date(now);

        start.setHours(
            Number(parts[0]),
            Number(parts[1]),
            0,
            0
        );

        const windowStart =
            new Date(
                start.getTime() -
                activity.lead * 60000
            );

        const windowEnd =
            new Date(
                start.getTime() +
                activity.lag * 60000
            );

        if (
            now >= windowStart &&
            now <= windowEnd
        ) {
            matches.push(activity);
        }
    }

    matches.sort(
        (a, b) =>
            a.start.localeCompare(b.start)
    );

    return matches;
}

/*
    Display activities
*/

function updateActivities(now) {

    const container1 =
        document.getElementById("activityPreText");

    const container =
        document.getElementById("activityHeading");

    /*
        Current activities take priority.
    */

    const current = getCurrentActivities(now);


    if (current.length > 0) {

        let html = "";
        let html1 = "";

        /* 
           current.forEach(activity => {   Replace if you only want to process all activity. 
           Ideally there should NEVER be entries in activities.json that have overlapping display windows as this does not
           fit within small screens 
        */
        const activity = current[0];
        
        if (activity.speakAudio == true) {
                speak(`${activity.audioline || ""} ${activity.status || ""}`); 
               }
        const priority = activity.priority || "normal";

        html += `

                <div class="activityCard priority-${priority}">

                    <div class="activityText">
                        ${activity.text.replaceAll(";", "<br>")}
                    </div>

                </div>

            `;
        html1 += `
                     <div class="${activity.catg === "activity" ? "activityStatus" : "activityStatus green"}">
                         ${activity.catg === "activity" ? (activity.status || "") : "Just a Reminder"}
                     </div>
                    `;
       
        container.innerHTML = html;
        container1.innerHTML = html1;

        return;
    }


    /*
        No current activity.
        Check for an upcoming activity.
    */

    const upcoming =
        getUpcomingActivities(now);


    if (upcoming.length > 0) {

        const activity = upcoming[0];

        const priority =
            activity.priority || "normal";

        container1.innerHTML = `

                <div class="activityStatus green">
                     Upcoming activity starts at ${activity.start} 
                     <br>
                </div>
            `;
        container.innerHTML = `

            <div class="activityCard priority-${priority}">
                <div class="activityText">
                    ${activity.text.replaceAll(";", "<br>")}                    
                </div>
            </div>

        `;

        return;
    }


    /*
        No current or upcoming activity.
    */

    container.innerHTML =
        "<div class='none'>No Activity for now</div>";
    
    container1.innerHTML = `

                <div class="activityStatus green">
                     Time to RELAX 
                </div>
                `;

}


/*
    Main refresh routine. Runs every 30 seconds
*/

function refreshDisplay() {

    updateOverlay();

    const now = new Date();

    updateClock(now);

    const specialPages =
        getCurrentSpecialPages(now);

    const normalActivityPanel =
        document.getElementById("normalActivityPanel");

    const specialFrame =
        document.getElementById("specialFrame");

    /*
        If a special page is active, prepare it.
    */

    if (specialPages.length > 0) {

        const page = specialPages[0].page;

        if (specialFrame.src !==
            new URL(page, window.location.href).href) {

            specialFrame.src = page;
        }

        normalActivityPanel.style.display = "none";
        specialFrame.style.display = "block";

    }

    /*
        Otherwise show the normal activity notification.
    */

    else {

        specialFrame.style.display = "none";
        normalActivityPanel.style.display = "block";
        updateActivities(now);
    }


    /*
        Toggle between clock and activity/special page.
    */

    document.getElementById("clockPanel").style.display =
        showClock ? "block" : "none";

    document.getElementById("activityPanel").style.display =
        showClock ? "none" : "block";

    showClock = !showClock;
}

function speak(text) {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.onend = resolve;
    utterance.onerror = reject;

    speechSynthesis.speak(utterance);
  });
}


function minutesSinceMidnight() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function calculateOpacity() {

    const now = minutesSinceMidnight();

    const fadeStart = 22 * 60;        // 10:00  PM
    const fadeEnd   = 22 * 60 + 5;        // 10:05 PM

    const brightenStart = 7 * 60;    // 7:00 AM
    const brightenEnd   = 7 * 60 + 5     // 7:04 AM
    
    // Fade in
    if (now >= fadeStart && now < fadeEnd) {
        return ((now - fadeStart) / (fadeEnd - fadeStart)) * MAX_DIM;
    }

    // Fully dim overnight
    if (now >= fadeEnd || now < brightenStart) {
        return MAX_DIM;
    }

    // Fade out
    if (now >= brightenStart && now < brightenEnd) {
        return (1 - ((now - brightenStart) / (brightenEnd - brightenStart))) * MAX_DIM;
    }

    // Daytime
    return 0;
}

function updateOverlay() {
    document.getElementById("nightOverlay").style.opacity = calculateOpacity();
}

function speak(text) {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.onend = resolve;
    utterance.onerror = reject;

    speechSynthesis.speak(utterance);
  });
}


/*
    Start application
*/

loadActivities(0.5);
setInterval(
    refreshDisplay,
    30000
);