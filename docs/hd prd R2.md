I want to keep our Kanban tab and Inbox tabs EXACTLY the way they are. Do not touch or change those. However, I don’t need us to build out the Search tab, Transcripts tab, Canvas tab, and settings tab- remove those. 

I want us to build out a Links tab, and a Images tab instead. 

Links tab: The goal of the Links tab is to have a quick place for me to see all the links in emails sent to agentmail in one place, with associated metadata. 

* For each link that comes through in an email, extract the link, and create a card and put an extracted link on the card. Each extracted link gets its own card.   
* Card requirement: I expect the Links tab to look like a pinterest board of cards that each have the following details:   
  * A short summary of what the link is for, based on the email / task content  
  * Clickable Link that opens in new tab by default  
  * Show tags associated with the link \- based on the tags you put on the email / task. Put the tags in the card.   
  * Show a preview of the link if available   
  * If i click into the card, I want to see a CTA that will take me to the email that had the link in it  
  * If i click into the card, I want to see a CTA that will take me to the task that had the link in it  
* Link requirements: Make the links clickable, open in a new tab by default  
* Allow me to filter through the link cards using tags.   
* Allow me to add notes manually to each card on the link.   
* Default sort the links by date and time from top to bottom, left to right, such that the top left corner is the newest, and bottom right corner is the oldest. The date and time should come from the email where the link came from – same as the Kanban tasks logic.   
* Allow me to archive link cards so that they are out of the main tab view, but i still want to b enable to access the archived view thru a link.   
* Don’t bury the archive link access at the very bottom. Put it in a subtle place but near the top above the fold.   
* I expect the links to be saved in supabase. 

Images tab: The goal of the Images tab is to have a quick place for me to see all the images associated with this home design project in one place, with associated metadata. On top of just seeing Images in one place, I want to create clones that I can edit and save in a thread as the original image. I will not only email images to agentmail, I will also upload PDF and Google Slides and Images myself to the home design hub. 

* For the image tab, I expect a pinterest-like board of images.   
* Each image can be cloned so I can edit it and save it, and thread it to the original.   
  * I expect that when I click on an image from the overview, it opens up a new surface.    
  * On this surface, there’s a “Clone” button where I can clone the image, and have that cloned image float on a canvas where I can edit the cloned image.    
  * For the clones on a canvas, I want an “edit” option where I can use simple markup tools to draw shapes on the cloned image, type text over it, draw arrows on it, draw lines on it. Simple markup tools to allow me to communicate changes i want to make.   
  * Once I edit a clone, I want to be able to save it. The saved clone will not overwrite the original. Rather, it is threaded / tied to the original, so that when I click on the original in the future, I can see all the cloned edited versions \+ the original   
* Images can come from different sources:   
  * Emails: For each image file that comes in via email (cover all the versions) – whether its pasted in an email or attached – extract it and put it in the Image tab.   
  * Google slides: If I give you a google slides link, I want you to turn each slide into an image.   
  * PDF: If I upload a PDF, i want you to turn each page of the PDF file into an image.   
  * Images: This is straightforward. I will upload images and i want you to save them.   
* Tagging:   
  * These tags should be the same set of tags that are in the Kanban board and email. There should only be one set of tags that govern the entire product, no matter what tab i am in, so make sure we have a master tagging system.   
  * For images that come from emails, I want you to tag the images with the same tags that you tagged in the email. The more granular you can get, the better. Make it so that I can add and remove tags afterwards if you get a tag wrong.   
  * For images that come from google slides, pdf, or images i upload, allow me to manually tag them with existing tags or create new tags.   
* I expect images, both originals and cloned edited ones to be saved in Supabase.   
    
  