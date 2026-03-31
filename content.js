// content.js

(() => {
  try {
    console.log("Attempting to extract email data from page...");

    let subjectElement = document.querySelector('h2.hP') || 
                         document.querySelector('[data-legacy-thread-id] h2') ||
                         document.querySelector('.ha h2') ||
                         document.querySelector('h2[data-thread-perm-id]');

    let senderElement = document.querySelector('span.gD[email]') ||
                        document.querySelector('.gD[email]') ||
                        document.querySelector('[data-hovercard-id]') ||
                        document.querySelector('.go[email]');

    let senderEmail = null;
    if (senderElement) {
      senderEmail = senderElement.getAttribute('email') || 
                    senderElement.getAttribute('data-hovercard-id') ||
                    senderElement.innerText;
    }

    if (!senderEmail) {
      const senderNameArea = document.querySelector('.gD') || 
                             document.querySelector('.go') ||
                             document.querySelector('[data-hovercard-id]');
      if (senderNameArea) {
        senderEmail = senderNameArea.getAttribute('email') || 
                      senderNameArea.getAttribute('data-hovercard-id') ||
                      senderNameArea.textContent;
      }
    }

    let contentElement = document.querySelector('div.a3s.aiL') ||
                         document.querySelector('.a3s') ||
                         document.querySelector('[data-message-id] .a3s') ||
                         document.querySelector('.ii.gt');

    if (subjectElement && senderEmail && contentElement) {
      const emailData = {
        sender: senderEmail.trim(),
        subject: subjectElement.innerText.trim(),
        body: contentElement.innerText.trim()
      };
      return emailData;
    } else {
      console.warn("Missing required elements:", {
        subject: subjectElement ? "found" : "missing",
        sender: senderEmail ? "found" : "missing", 
        content: contentElement ? "found" : "missing"
      });
      return null;
    }
  } catch (error) {
    console.error("Error extracting email data:", error);
    return null;
  }
})();